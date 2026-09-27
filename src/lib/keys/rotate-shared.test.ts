import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { writeAccountRecord } from "../account/account-record";
import { bytesToBase64 } from "../crypto/base64";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, createWing, listBranches } from "../hierarchy/entity-storage";
import { writeSharePath } from "../hierarchy/share-path-storage";
import { createObjectKey } from "./key-graph";
import {
  currentKeyGraph,
  forgetKeyring,
  heldKeyring,
  holdKeyring,
  holdServedGraph,
} from "./object-keys";
import {
  resetRotationSweep,
  ROTATE_AFTER_MS,
  rotateAgedKeys,
  rotateSharedKey,
} from "./rotate-shared";

const BASE = "https://cuervo.example.com";
const session = { baseUrl: BASE, token: "a-token" };
const DAY = 24 * 60 * 60 * 1000;

async function publicKey() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );

  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
}

/** An account's workspace with one course in it, shared from here once. */
async function sharedCourse() {
  const wing = await createObjectKey("wing");

  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(new Map([[wing.keyId, wing.key]]), {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [{ keyId: wing.keyId, role: "writer", wrapped: "g" }],
  });

  const flight = await createFlight({ wingId: (await createWing("W")).id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
  const database = await getNotesDb();
  const keyId = (await database.get("branches", branch.id))?.keyId ?? "";

  await writeSharePath(keyId);

  return { branch, keyId, mine: await publicKey() };
}

/** What the server does for a rotation, recording what it was told. */
function rotationServer(shares: { email: string; role: "reader" | "writer" }[], friendKey: string) {
  const uploaded: unknown[] = [];
  const reshared: { email: string; keyId: string }[] = [];

  server.use(
    http.post(`${BASE}/v1/keys`, async ({ request }) => {
      uploaded.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${BASE}/v1/keys/:keyId/shares`, () => HttpResponse.json({ shares })),
    http.get(`${BASE}/v1/users/public-key`, ({ request }) =>
      HttpResponse.json({
        email: new URL(request.url).searchParams.get("email"),
        publicKey: friendKey,
      }),
    ),
    http.post(`${BASE}/v1/keys/share`, async ({ request }) => {
      reshared.push((await request.json()) as { email: string; keyId: string });
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return { uploaded, reshared };
}

async function clearStores() {
  const database = await getNotesDb();

  for (const store of ["wings", "flights", "branches", "share-paths", "account"] as const) {
    await database.clear(store);
  }
}

beforeEach(async () => {
  resetRotationSweep();
  await clearStores();
});

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("rotateSharedKey", () => {
  it("moves the rows onto the new key as fresh edits, readable here straight away", async () => {
    const { keyId, mine } = await sharedCourse();
    const { reshared } = rotationServer([], await publicKey());
    const database = await getNotesDb();
    const before = (await database.getAll("branches"))[0].updatedAt;

    expect(
      await rotateSharedKey({
        session,
        keyId,
        publicKey: mine,
        recipients: [{ email: "friend@example.com", role: "reader" }],
      }),
    ).toBe(true);

    const moved = (await database.getAll("branches"))[0];

    expect(moved.keyId).not.toBe(keyId);
    // Stamped, so sync sends it again under the key that replaced the old one.
    expect(moved.updatedAt).toBeGreaterThanOrEqual(before);
    expect((await listBranches())[0].name).toBe("Thermodynamics");
    expect(currentKeyGraph()?.keys.map((key) => key.rotatedFrom)).toContain(keyId);
    expect(reshared).toEqual([expect.objectContaining({ email: "friend@example.com" })]);

    // The path above the course moved with it.
    expect((await database.getAll("share-paths"))[0].keyId).toBe(moved.keyId);
  });

  it("refuses from a device that does not hold everything the key hangs under", async () => {
    const { keyId, mine } = await sharedCourse();
    const graph = currentKeyGraph()!;

    // What a writer given this course alone would hold: the course key, not the term.
    holdKeyring(new Map(), graph);

    expect(await rotateSharedKey({ session, keyId, publicKey: mine, recipients: [] })).toBe(false);
  });

  it("refuses a key this device holds but never recorded", async () => {
    const { keyId, mine } = await sharedCourse();
    const graph = currentKeyGraph()!;

    holdKeyring(heldKeyring()!, { ...graph, keys: graph.keys.filter((key) => key.id !== keyId) });

    expect(await rotateSharedKey({ session, keyId, publicKey: mine, recipients: [] })).toBe(false);
  });

  it("refuses with no keys in hand at all", async () => {
    expect(await rotateSharedKey({ session, keyId: "k", publicKey: "p", recipients: [] })).toBe(
      false,
    );
  });
});

describe("rotateAgedKeys", () => {
  async function withAccount(mine: string) {
    await writeAccountRecord({
      email: "me@example.com",
      baseUrl: BASE,
      material: {
        kdf: { name: "Argon2id", memorySize: 8, iterations: 1, parallelism: 1, salt: "c2FsdA==" },
        sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5",
        publicKey: mine,
        sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5",
      },
      wingKeyId: "wing",
      wrappedWingKey: "wrapped",
      graph: { keys: [], wraps: [], grants: [] },
    });
  }

  /** The server says when it first recorded the key. */
  function aged(keyId: string, createdAt: number) {
    holdServedGraph({
      keys: [{ id: keyId, kind: "branch", rotatedFrom: null, createdAt }],
      wraps: [],
      grants: [],
    });
  }

  it("rotates a shared key older than the limit, once", async () => {
    const { keyId, mine } = await sharedCourse();
    const { uploaded } = rotationServer(
      [{ email: "friend@example.com", role: "reader" }],
      await publicKey(),
    );

    await withAccount(mine);
    aged(keyId, Date.now() - ROTATE_AFTER_MS - DAY);

    expect(await rotateAgedKeys(session)).toBe(1);
    expect(await rotateAgedKeys(session)).toBe(0);
    expect(uploaded).toHaveLength(1);
  });

  it("leaves a young key, a key of unknown age, and one nobody else holds", async () => {
    const { keyId, mine } = await sharedCourse();
    const { uploaded } = rotationServer([], await publicKey());

    await withAccount(mine);

    // Unknown: the server has not said when it recorded this one.
    expect(await rotateAgedKeys(session)).toBe(0);

    aged(keyId, Date.now() - DAY);
    expect(await rotateAgedKeys(session)).toBe(0);

    // Old, but shared with nobody any more: there is nobody to protect from it.
    aged(keyId, Date.now() - ROTATE_AFTER_MS - DAY);
    expect(await rotateAgedKeys(session)).toBe(0);
    expect(uploaded).toEqual([]);
  });

  it("does nothing without an account or keys", async () => {
    expect(await rotateAgedKeys(session)).toBe(0);

    await withAccount(await publicKey());
    expect(await rotateAgedKeys(session)).toBe(0);
  });
});
