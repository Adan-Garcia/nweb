// @vitest-environment node
import type { SyncRow } from "@shared/sync-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

/**
 * What a share actually delivers.
 *
 * The key graph decides who *can* read a course; this decides whether the rows ever reach
 * them. Scoping the row store by owner would make sharing a promise with nothing behind it:
 * the recipient would hold a key that opens bytes they are never sent.
 */
const BASE = {
  authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
  kdf: {
    name: "Argon2id" as const,
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    salt: "c2FsdHktc2FsdC1oZXJl",
  },
  sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
  sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
};

let database: Sql & { close: () => Promise<void> };
let app: ReturnType<typeof createApp>;

async function signUp(email: string) {
  await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...BASE, email, publicKey: `public-key-of-${email}` }),
  });

  const response = await app.request("/v1/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, authKey: BASE.authKey }),
  });

  return ((await response.json()) as { token: string }).token;
}

const post = (token: string, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const syncAs = async (token: string, rows: SyncRow[] = [], since = 0) =>
  (await post(token, "/v1/sync", { since, rows })).json() as Promise<{
    seq: number;
    rows: SyncRow[];
  }>;

function row(overrides: Partial<SyncRow> & Pick<SyncRow, "id" | "keyId">): SyncRow {
  return {
    store: "branches",
    updatedAt: 1_000,
    deletedAt: null,
    encryption: "aes-gcm",
    payload: "sealed-bytes",
    schedule: null,
    ...overrides,
  };
}

/** A course with a note in it, each under its own key, both hung under the owner's wing. */
async function seedCourse(owner: string) {
  await post(owner, "/v1/keys", {
    keys: [
      { id: "wing-key", kind: "wing", rotatedFrom: null },
      { id: "branch-key", kind: "branch", rotatedFrom: null },
      { id: "note-key", kind: "feather", rotatedFrom: null },
      { id: "other-branch-key", kind: "branch", rotatedFrom: null },
    ],
    wraps: [
      { parentKeyId: "wing-key", childKeyId: "branch-key", wrapped: "branch-under-wing" },
      { parentKeyId: "branch-key", childKeyId: "note-key", wrapped: "note-under-branch" },
      { parentKeyId: "wing-key", childKeyId: "other-branch-key", wrapped: "other-under-wing" },
    ],
    grants: [{ keyId: "wing-key", role: "writer", wrapped: "wing-for-owner" }],
  });

  await syncAs(owner, [
    row({ id: "branch-1", keyId: "branch-key" }),
    row({ id: "note-1", store: "notes-directory", keyId: "note-key" }),
    row({ id: "branch-2", keyId: "other-branch-key" }),
  ]);
}

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

describe("a course shared with somebody", () => {
  it("reaches them, along with what is inside it", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "branch-for-friend",
    });

    const theirs = await syncAs(friend);

    // The course and the note in it: exactly the rows whose keys they can now derive.
    expect(theirs.rows.map((each) => each.id).sort()).toEqual(["branch-1", "note-1"]);
  });

  it("does not reach the course next to it", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "branch-for-friend",
    });

    const theirs = await syncAs(friend);

    expect(theirs.rows.map((each) => each.id)).not.toContain("branch-2");
  });

  it("reaches nobody who was not given a key", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const stranger = await signUp("stranger@example.com");

    const theirs = await syncAs(stranger);

    // Bytes they cannot open would be pointless to serve, and a fact about somebody else's
    // workspace besides.
    expect(theirs.rows).toEqual([]);
  });

  it("stops reaching them once it is taken back", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "branch-for-friend",
    });
    await post(owner, "/v1/keys/revoke", {
      keyId: "branch-key",
      email: "friend@example.com",
    });

    expect((await syncAs(friend)).rows).toEqual([]);
  });
});

describe("changing something shared with you", () => {
  it("changes the owner's row rather than making a second one", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "writer",
      wrapped: "branch-for-friend",
    });

    await syncAs(friend, [
      row({ id: "branch-1", keyId: "branch-key", updatedAt: 2_000, payload: "their-edit" }),
    ]);

    // One row, not two: the owner sees the edit, and neither device is left convinced it
    // has the only copy.
    const { rows } = await database.query<{ payload: string }>(
      "select payload from rows where store = 'branches' and id = 'branch-1'",
    );

    expect(rows).toEqual([{ payload: "their-edit" }]);
    expect((await syncAs(owner)).rows.find((each) => each.id === "branch-1")?.payload).toBe(
      "their-edit",
    );
  });

  it("is dropped for a reader rather than forked into a copy of their own", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "branch-for-friend",
    });

    await syncAs(friend, [
      row({ id: "branch-1", keyId: "branch-key", updatedAt: 2_000, payload: "their-edit" }),
    ]);

    // The owner's copy is untouched, and there is still only one of it. The server cannot
    // merge ciphertext and must not fork it; a reader was never offered the pen.
    const { rows } = await database.query<{ payload: string }>(
      "select payload from rows where store = 'branches' and id = 'branch-1'",
    );

    expect(rows).toEqual([{ payload: "sealed-bytes" }]);
  });

  it("cannot be used to overwrite a row whose key was never shared", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "writer",
      wrapped: "branch-for-friend",
    });

    // A writer on one course, pushing at the course next to it.
    await syncAs(friend, [
      row({ id: "branch-2", keyId: "other-branch-key", updatedAt: 2_000, payload: "forged" }),
    ]);

    const { rows } = await database.query<{ payload: string }>(
      `select payload from rows
       where store = 'branches' and id = 'branch-2'
         and user_id = (select id from users where email = 'owner@example.com')`,
    );

    expect(rows).toEqual([{ payload: "sealed-bytes" }]);
  });

  it("still loses to a newer edit, whoever made it", async () => {
    const owner = await signUp("owner@example.com");
    await seedCourse(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "writer",
      wrapped: "branch-for-friend",
    });

    await syncAs(owner, [
      row({ id: "branch-1", keyId: "branch-key", updatedAt: 3_000, payload: "owners-newer-edit" }),
    ]);
    await syncAs(friend, [
      row({ id: "branch-1", keyId: "branch-key", updatedAt: 2_000, payload: "their-older-edit" }),
    ]);

    // Last write wins by `updatedAt`, and sharing does not make an old edit new.
    const { rows } = await database.query<{ payload: string }>(
      "select payload from rows where store = 'branches' and id = 'branch-1'",
    );

    expect(rows).toEqual([{ payload: "owners-newer-edit" }]);
  });
});
