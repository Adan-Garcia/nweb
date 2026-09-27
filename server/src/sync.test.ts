// @vitest-environment node
import type { SyncRow } from "@shared/sync-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

const ENROLMENT = {
  email: "student@example.com",
  authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
  kdf: {
    name: "Argon2id" as const,
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    salt: "c2FsdHktc2FsdC1oZXJlIQ==",
  },
  sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
  publicKey: "cHVibGljLWtleS1zcGtpLWJ5dGVz",
  sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
};

let database: Sql & { close: () => Promise<void> };
let app: ReturnType<typeof createApp>;

function row(overrides: Partial<SyncRow> = {}): SyncRow {
  return {
    store: "twigs",
    id: "twig-1",
    updatedAt: 1_000,
    deletedAt: null,
    keyId: "key-a",
    encryption: "aes-gcm",
    payload: "c2VhbGVkLXJvdw",
    schedule: {
      dueDate: "2026-10-01",
      dueMinutes: 540,
      timeZone: "America/New_York",
      status: "incomplete",
    },
    ...overrides,
  };
}

async function signIn(email = ENROLMENT.email) {
  await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ENROLMENT, email }),
  });

  const response = await app.request("/v1/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, authKey: ENROLMENT.authKey }),
  });

  return ((await response.json()) as { token: string }).token;
}

const postSync = (token: string, body: { since: number; rows: SyncRow[] }) =>
  app.request("/v1/sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  database = await createTestDb();
  app = createApp({
    sql: database,
    serverSecret: "a secret",
    allowedOrigins: [],
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });
});

afterEach(async () => {
  await database.close();
});

describe("pushing rows", () => {
  it("stores what it is given and hands it back above the cursor", async () => {
    const token = await signIn();

    const pushed = await postSync(token, { since: 0, rows: [row()] });
    const body = (await pushed.json()) as { seq: number; rows: SyncRow[]; hasMore: boolean };

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ id: "twig-1", payload: "c2VhbGVkLXJvdw" });
    expect(body.seq).toBeGreaterThan(0);
    expect(body.hasMore).toBe(false);
  });

  it("keeps the payload sealed and stores nothing it could read", async () => {
    const token = await signIn();
    await postSync(token, { since: 0, rows: [row()] });

    const { rows } = await database.query<Record<string, unknown>>("select * from rows");

    // The whole row is in one opaque column. What is beside it is a timestamp and what a
    // reminder needs, and nothing else.
    expect(rows[0]).toMatchObject({
      payload: "c2VhbGVkLXJvdw",
      due_date: "2026-10-01",
      status: "incomplete",
      key_id: "key-a",
    });
    expect(Object.keys(rows[0])).not.toContain("title");
  });

  it("gives nothing back for a cursor that is already current", async () => {
    const token = await signIn();
    const first = (await (await postSync(token, { since: 0, rows: [row()] })).json()) as {
      seq: number;
    };

    const second = (await (await postSync(token, { since: first.seq, rows: [] })).json()) as {
      rows: SyncRow[];
      seq: number;
    };

    expect(second.rows).toEqual([]);
    expect(second.seq).toBe(first.seq);
  });
});

describe("a row that is not a task", () => {
  it("carries no schedule, and comes back without one", async () => {
    const token = await signIn();

    await postSync(token, {
      since: 0,
      rows: [row({ store: "branches", id: "branch-1", schedule: null })],
    });

    const body = (await (await postSync(token, { since: 0, rows: [] })).json()) as {
      rows: SyncRow[];
    };

    expect(body.rows[0].schedule).toBeNull();

    // And the columns a reminder would read are empty rather than defaulted to something.
    const { rows } = await database.query<Record<string, unknown>>("select * from rows");
    expect(rows[0]).toMatchObject({ due_date: null, status: null, time_zone: null });
  });

  it("keeps a task whose date has been cleared schedulable but undated", async () => {
    const token = await signIn();

    await postSync(token, {
      since: 0,
      rows: [
        row({
          schedule: { dueDate: null, dueMinutes: null, timeZone: "UTC", status: "complete" },
        }),
      ],
    });

    const body = (await (await postSync(token, { since: 0, rows: [] })).json()) as {
      rows: SyncRow[];
    };

    expect(body.rows[0].schedule).toEqual({
      dueDate: null,
      dueMinutes: null,
      timeZone: "UTC",
      status: "complete",
    });
  });
});

describe("last write wins", () => {
  it("takes the newer edit whichever order it arrives in", async () => {
    const token = await signIn();

    await postSync(token, { since: 0, rows: [row({ updatedAt: 2_000, payload: "bmV3ZXI" })] });
    // A device that has been offline pushes something older. Arriving later does not make
    // it win, or catching up would undo whatever happened while it was away.
    await postSync(token, { since: 0, rows: [row({ updatedAt: 1_000, payload: "b2xkZXI" })] });

    const { rows } = await database.query<{ payload: string }>("select payload from rows");
    expect(rows[0].payload).toBe("bmV3ZXI");
  });

  it("treats a tombstone as a row like any other", async () => {
    const token = await signIn();
    await postSync(token, { since: 0, rows: [row({ updatedAt: 1_000 })] });

    await postSync(token, {
      since: 0,
      rows: [row({ updatedAt: 2_000, deletedAt: 2_000, payload: "" })],
    });

    const { rows } = await database.query<{ deleted_at: string | null }>(
      "select deleted_at from rows",
    );
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it("does not let an older delete undo a newer edit", async () => {
    const token = await signIn();
    await postSync(token, { since: 0, rows: [row({ updatedAt: 3_000, payload: "ZWRpdGVk" })] });

    await postSync(token, {
      since: 0,
      rows: [row({ updatedAt: 1_000, deletedAt: 1_000, payload: "" })],
    });

    const { rows } = await database.query<{ deleted_at: string | null; payload: string }>(
      "select deleted_at, payload from rows",
    );
    expect(rows[0].deleted_at).toBeNull();
    expect(rows[0].payload).toBe("ZWRpdGVk");
  });
});

describe("two devices", () => {
  it("each sees what the other wrote, and neither sees its own twice", async () => {
    const token = await signIn();

    const deviceA = (await (
      await postSync(token, { since: 0, rows: [row({ id: "from-a" })] })
    ).json()) as { seq: number; rows: SyncRow[] };

    // B has never synced, so it asks from nothing and gets what A wrote.
    const deviceB = (await (
      await postSync(token, { since: 0, rows: [row({ id: "from-b" })] })
    ).json()) as { seq: number; rows: SyncRow[] };

    expect(deviceB.rows.map((r) => r.id).sort()).toEqual(["from-a", "from-b"]);

    // A asks again from where it got to and sees only B's.
    const again = (await (await postSync(token, { since: deviceA.seq, rows: [] })).json()) as {
      rows: SyncRow[];
    };
    expect(again.rows.map((r) => r.id)).toEqual(["from-b"]);
  });

  it("keeps one account's rows away from another's", async () => {
    const mine = await signIn("mine@example.com");
    const theirs = await signIn("theirs@example.com");

    await postSync(mine, { since: 0, rows: [row({ id: "mine" })] });

    const seen = (await (await postSync(theirs, { since: 0, rows: [] })).json()) as {
      rows: SyncRow[];
    };
    expect(seen.rows).toEqual([]);
  });
});

describe("paging", () => {
  it("says when there is more than one page to come", async () => {
    const token = await signIn();

    for (let batch = 0; batch < 2; batch += 1) {
      await postSync(token, {
        since: 0,
        rows: Array.from({ length: 120 }, (_, index) => row({ id: `row-${batch}-${index}` })),
      });
    }

    const first = (await (await postSync(token, { since: 0, rows: [] })).json()) as {
      seq: number;
      rows: SyncRow[];
      hasMore: boolean;
    };

    expect(first.rows).toHaveLength(200);
    expect(first.hasMore).toBe(true);

    const second = (await (await postSync(token, { since: first.seq, rows: [] })).json()) as {
      rows: SyncRow[];
      hasMore: boolean;
    };
    expect(second.rows).toHaveLength(40);
    expect(second.hasMore).toBe(false);
  });

  it("refuses a push bigger than a page rather than taking half of it", async () => {
    const token = await signIn();

    const response = await postSync(token, {
      since: 0,
      rows: Array.from({ length: 201 }, (_, index) => row({ id: `row-${index}` })),
    });

    expect(response.status).toBe(400);
  });
});

describe("media", () => {
  const put = (token: string, id: string, bytes: Uint8Array, updatedAt = 1_000) =>
    app.request(`/v1/media/${id}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "x-media-type": "image/webp",
        "x-media-created": "1",
        "x-media-updated": String(updatedAt),
        "x-media-key": "key-a",
        "x-media-encryption": "aes-gcm",
      },
      body: bytes,
    });

  it("round-trips the bytes it was given", async () => {
    const token = await signIn();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    expect((await put(token, "pic-1", bytes)).status).toBe(204);

    const response = await app.request("/v1/media/pic-1", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("x-media-type")).toBe("image/webp");
    expect(response.headers.get("x-media-key")).toBe("key-a");
  });

  it("lists what is stored, so a device can tell what it is missing", async () => {
    const token = await signIn();
    await put(token, "pic-1", new Uint8Array([1]));
    await put(token, "pic-2", new Uint8Array([2]));

    const listed = (await (
      await app.request("/v1/media", { headers: { authorization: `Bearer ${token}` } })
    ).json()) as { media: { id: string }[] };

    expect(listed.media.map((item) => item.id)).toEqual(["pic-1", "pic-2"]);
  });

  it("is 404 for something that was never uploaded", async () => {
    const token = await signIn();

    const response = await app.request("/v1/media/missing", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
  });

  it("refuses a request with no media headers", async () => {
    const token = await signIn();

    const response = await app.request("/v1/media/pic-1", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: new Uint8Array([1]),
    });

    expect(response.status).toBe(400);
  });

  it("refuses a sync body that is not one, rather than crashing the route", async () => {
    const token = await signIn();

    const response = await app.request("/v1/sync", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{ this is not json",
    });

    expect(response.status).toBe(400);
  });

  it("needs a session, like everything else that holds anything", async () => {
    expect((await app.request("/v1/media")).status).toBe(401);
    expect((await app.request("/v1/media/pic-1")).status).toBe(401);
    expect((await app.request("/v1/media/pic-1", { method: "PUT" })).status).toBe(401);
    expect((await app.request("/v1/sync", { method: "POST" })).status).toBe(401);
  });

  it("refuses a body bigger than it will store", async () => {
    const token = await signIn();

    const response = await put(token, "huge", new Uint8Array(25 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });
});
