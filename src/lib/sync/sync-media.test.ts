// @vitest-environment node
//
// Node, not jsdom: this reads media back out of stored Blobs, and fake-indexeddb flattens
// a jsdom Blob into a bare object with no arrayBuffer().
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { getNotesDb } from "../db/notes-db";
import { syncMedia } from "./sync-media";

const SESSION = { baseUrl: "https://api.example", token: "a-token" };

async function seedLocal(id: string, text: string, updatedAt = 1_000) {
  const database = await getNotesDb();

  await database.put("notes-media", {
    id,
    blob: new Blob([new TextEncoder().encode(text)]),
    mimeType: "image/webp",
    created: 1,
    updatedAt,
    keyId: "key-a",
    encryption: "aes-gcm",
  });
}

function remote(media: { id: string; updatedAt: number }[], bytes: Record<string, string> = {}) {
  const uploads: { id: string; bytes: Uint8Array }[] = [];

  server.use(
    http.get("https://api.example/v1/media", () =>
      HttpResponse.json({
        media: media.map((item) => ({
          id: item.id,
          mimeType: "image/webp",
          created: 1,
          updatedAt: item.updatedAt,
          keyId: "key-a",
          encryption: "aes-gcm",
        })),
      }),
    ),
    http.put("https://api.example/v1/media/:id", async ({ params, request }) => {
      uploads.push({
        id: String(params.id),
        bytes: new Uint8Array(await request.arrayBuffer()),
      });

      return new HttpResponse(null, { status: 204 });
    }),
    http.get("https://api.example/v1/media/:id", ({ params }) => {
      const text = bytes[String(params.id)];

      return text === undefined
        ? new HttpResponse(null, { status: 404 })
        : new HttpResponse(new TextEncoder().encode(text), {
            headers: {
              "x-media-type": "image/webp",
              "x-media-created": "1",
              "x-media-updated": "2000",
              "x-media-key": "key-a",
              "x-media-encryption": "aes-gcm",
            },
          });
    }),
  );

  return uploads;
}

beforeEach(async () => {
  const database = await getNotesDb();
  await database.clear("notes-media");
});

describe("syncMedia", () => {
  it("uploads what the server does not have", async () => {
    const uploads = remote([]);
    await seedLocal("pic-1", "PICTURE-BYTES");

    const outcome = await syncMedia(SESSION);

    expect(outcome).toEqual({ uploaded: 1, downloaded: 0 });
    expect(uploads).toHaveLength(1);
    expect(new TextDecoder().decode(uploads[0].bytes)).toBe("PICTURE-BYTES");
  });

  it("skips a file the server already has, because the id is a hash of the bytes", async () => {
    const uploads = remote([{ id: "pic-1", updatedAt: 1_000 }]);
    await seedLocal("pic-1", "PICTURE-BYTES", 1_000);

    const outcome = await syncMedia(SESSION);

    expect(uploads).toHaveLength(0);
    expect(outcome).toEqual({ uploaded: 0, downloaded: 0 });
  });

  it("re-uploads when a rekey has rewritten the bytes under an id", async () => {
    const uploads = remote([{ id: "pic-1", updatedAt: 1_000 }]);
    await seedLocal("pic-1", "RESEALED", 5_000);

    await syncMedia(SESSION);

    expect(uploads).toHaveLength(1);
  });

  it("downloads what this device is missing", async () => {
    remote([{ id: "pic-2", updatedAt: 2_000 }], { "pic-2": "FROM-ELSEWHERE" });

    const outcome = await syncMedia(SESSION);

    expect(outcome).toEqual({ uploaded: 0, downloaded: 1 });

    const database = await getNotesDb();
    const stored = await database.get("notes-media", "pic-2");
    expect(new TextDecoder().decode(new Uint8Array(await stored!.blob.arrayBuffer()))).toBe(
      "FROM-ELSEWHERE",
    );
    // The marker comes with it, so this device knows which key would open it.
    expect(stored?.encryption).toBe("aes-gcm");
    expect(stored?.keyId).toBe("key-a");
  });

  it("carries on when one file will not download", async () => {
    remote(
      [
        { id: "here", updatedAt: 2_000 },
        { id: "gone", updatedAt: 2_000 },
      ],
      {
        here: "FINE",
      },
    );

    const outcome = await syncMedia(SESSION);

    expect(outcome).toEqual({ uploaded: 0, downloaded: 1 });
  });

  it("uploads a row written before markers existed as plaintext", async () => {
    const uploads = remote([]);
    const database = await getNotesDb();
    await database.put("notes-media", {
      id: "old-pic",
      blob: new Blob([new TextEncoder().encode("OLD")]),
      mimeType: "image/webp",
      created: 1,
      updatedAt: 1,
    });

    server.use(
      http.put("https://api.example/v1/media/:id", ({ request }) => {
        expect(request.headers.get("x-media-encryption")).toBe("none");
        expect(request.headers.get("x-media-key")).toBe("");

        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await syncMedia(SESSION)).toEqual({ uploaded: 1, downloaded: 0 });
    expect(uploads).toHaveLength(0);
  });

  it("falls back to the listed metadata when the headers do not carry it", async () => {
    server.use(
      http.get("https://api.example/v1/media", () =>
        HttpResponse.json({
          media: [
            {
              id: "pic-3",
              mimeType: "image/png",
              created: 3,
              updatedAt: 4,
              keyId: "key-b",
              encryption: "none",
            },
          ],
        }),
      ),
      http.get(
        "https://api.example/v1/media/:id",
        () => new HttpResponse(new TextEncoder().encode("NO HEADERS")),
      ),
    );

    expect(await syncMedia(SESSION)).toEqual({ uploaded: 0, downloaded: 1 });

    const database = await getNotesDb();
    const stored = await database.get("notes-media", "pic-3");
    expect(stored?.mimeType).toBe("image/png");
    expect(stored?.keyId).toBe("key-b");
  });

  it("gives up quietly when the list cannot be fetched", async () => {
    server.use(http.get("https://api.example/v1/media", () => HttpResponse.error()));

    expect(await syncMedia(SESSION)).toBeNull();
  });

  it("does not count an upload the server refused", async () => {
    server.use(
      http.get("https://api.example/v1/media", () => HttpResponse.json({ media: [] })),
      http.put("https://api.example/v1/media/:id", () =>
        HttpResponse.json({ error: "too_large", message: "no" }, { status: 413 }),
      ),
    );
    await seedLocal("pic-1", "TOO BIG");

    expect(await syncMedia(SESSION)).toEqual({ uploaded: 0, downloaded: 0 });
  });
});
