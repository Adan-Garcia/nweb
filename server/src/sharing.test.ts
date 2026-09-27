// @vitest-environment node
import type { KeyGraph } from "@shared/sharing-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

const BASE = {
  authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
  kdf: {
    name: "Argon2id" as const,
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    salt: "c2FsdHktc2FsdC1oZXJlIQ==",
  },
  sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
  sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
};

let database: Sql & { close: () => Promise<void> };
let app: ReturnType<typeof createApp>;

async function signUp(email: string, publicKey = `public-key-of-${email}`) {
  await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...BASE, email, publicKey }),
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

const graphOf = async (token: string) =>
  (await (
    await app.request("/v1/keys/graph", { headers: { authorization: `Bearer ${token}` } })
  ).json()) as KeyGraph;

/**
 * A small workspace: a course with a tag under it, a note under the tag, and a second note
 * under the course but not the tag.
 */
async function seedGraph(token: string) {
  await post(token, "/v1/keys", {
    keys: [
      { id: "branch-key", kind: "branch", rotatedFrom: null },
      { id: "nest-key", kind: "nest", rotatedFrom: null },
      { id: "tagged-note-key", kind: "feather", rotatedFrom: null },
      { id: "plain-note-key", kind: "feather", rotatedFrom: null },
    ],
    wraps: [
      { parentKeyId: "branch-key", childKeyId: "nest-key", wrapped: "nest-under-branch" },
      { parentKeyId: "branch-key", childKeyId: "tagged-note-key", wrapped: "tagged-under-branch" },
      { parentKeyId: "nest-key", childKeyId: "tagged-note-key", wrapped: "tagged-under-nest" },
      { parentKeyId: "branch-key", childKeyId: "plain-note-key", wrapped: "plain-under-branch" },
    ],
    grants: [{ keyId: "branch-key", role: "writer", wrapped: "branch-for-owner" }],
  });
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

describe("the key graph", () => {
  it("gives back everything reachable from a grant", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);

    const graph = await graphOf(owner);

    expect(graph.keys.map((key) => key.id).sort()).toEqual([
      "branch-key",
      "nest-key",
      "plain-note-key",
      "tagged-note-key",
    ]);
    expect(graph.grants).toHaveLength(1);
  });

  it("carries both edges to a note that is in a tag and a course", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);

    const graph = await graphOf(owner);
    const toTagged = graph.wraps.filter((wrap) => wrap.childKeyId === "tagged-note-key");

    // A nest is a tag, so what contains what is a graph. Both routes to the note are real
    // and either one has to be enough to open it.
    expect(toTagged.map((wrap) => wrap.parentKeyId).sort()).toEqual(["branch-key", "nest-key"]);
  });

  it("gives a stranger nothing, however many wraps exist", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const stranger = await signUp("stranger@example.com");

    const graph = await graphOf(stranger);

    // Not even the wraps: a wrap whose parent they cannot derive is useless to them, and
    // it is still a fact about somebody else's workspace.
    expect(graph).toEqual({ keys: [], wraps: [], grants: [] });
  });
});

describe("sharing one level", () => {
  it("hands over a tag and nothing above it", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const friend = await signUp("friend@example.com");

    expect(
      (
        await post(owner, "/v1/keys/share", {
          keyId: "nest-key",
          email: "friend@example.com",
          role: "reader",
          wrapped: "nest-for-friend",
        })
      ).status,
    ).toBe(204);

    const graph = await graphOf(friend);

    // The tag and the note it holds — not the course above it, and not the note that was
    // never tagged.
    expect(graph.keys.map((key) => key.id).sort()).toEqual(["nest-key", "tagged-note-key"]);
    expect(graph.grants[0]).toMatchObject({ keyId: "nest-key", role: "reader" });
  });

  it("hands over a single note with no route to anything else", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const friend = await signUp("friend@example.com");

    await post(owner, "/v1/keys/share", {
      keyId: "plain-note-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "note-for-friend",
    });

    const graph = await graphOf(friend);

    expect(graph.keys.map((key) => key.id)).toEqual(["plain-note-key"]);
    expect(graph.wraps).toEqual([]);
  });

  it("refuses to share a key the sharer cannot reach", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const stranger = await signUp("stranger@example.com");
    await signUp("victim@example.com");

    const response = await post(stranger, "/v1/keys/share", {
      keyId: "branch-key",
      email: "victim@example.com",
      role: "reader",
      wrapped: "forged",
    });

    expect(response.status).toBe(400);
  });

  it("says the same thing about an address with no account", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);

    const response = await post(owner, "/v1/keys/share", {
      keyId: "branch-key",
      email: "nobody@example.com",
      role: "reader",
      wrapped: "for-nobody",
    });

    expect(response.status).toBe(400);
  });
});

describe("revoking", () => {
  it("stops the server handing those bytes over again", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const friend = await signUp("friend@example.com");
    await post(owner, "/v1/keys/share", {
      keyId: "nest-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "nest-for-friend",
    });

    const response = await post(owner, "/v1/keys/revoke", {
      keyId: "nest-key",
      email: "friend@example.com",
    });

    expect(response.status).toBe(204);
    expect(await graphOf(friend)).toEqual({ keys: [], wraps: [], grants: [] });
  });

  it("refuses to revoke a key the caller does not hold", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const stranger = await signUp("stranger@example.com");

    const response = await post(stranger, "/v1/keys/revoke", {
      keyId: "branch-key",
      email: "owner@example.com",
    });

    expect(response.status).toBe(400);
  });

  it("refuses an address with no account", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);

    const response = await post(owner, "/v1/keys/revoke", {
      keyId: "branch-key",
      email: "nobody@example.com",
    });

    expect(response.status).toBe(400);
  });
});

describe("who can see a thing", () => {
  it("lists the addresses a key has been given to", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    await signUp("friend@example.com");
    await post(owner, "/v1/keys/share", {
      keyId: "nest-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "nest-for-friend",
    });

    const listed = (await (
      await app.request("/v1/keys/nest-key/shares", {
        headers: { authorization: `Bearer ${owner}` },
      })
    ).json()) as { shares: { email: string; role: string }[] };

    expect(listed.shares).toEqual([{ email: "friend@example.com", role: "reader" }]);
  });

  it("will not list a key the caller cannot reach", async () => {
    const owner = await signUp("owner@example.com");
    await seedGraph(owner);
    const stranger = await signUp("stranger@example.com");

    const response = await app.request("/v1/keys/branch-key/shares", {
      headers: { authorization: `Bearer ${stranger}` },
    });

    expect(response.status).toBe(400);
  });
});

describe("looking up a public key", () => {
  it("gives the key needed to share with someone", async () => {
    const owner = await signUp("owner@example.com");
    await signUp("friend@example.com", "friend-spki");

    const response = await app.request("/v1/users/public-key?email=friend@example.com", {
      headers: { authorization: `Bearer ${owner}` },
    });

    expect(await response.json()).toEqual({
      email: "friend@example.com",
      publicKey: "friend-spki",
    });
  });

  it("refuses a request with no address at all", async () => {
    const owner = await signUp("owner@example.com");

    const response = await app.request("/v1/users/public-key", {
      headers: { authorization: `Bearer ${owner}` },
    });

    expect(response.status).toBe(400);
  });

  it("says nothing about an address with no account", async () => {
    const owner = await signUp("owner@example.com");

    const response = await app.request("/v1/users/public-key?email=nobody@example.com", {
      headers: { authorization: `Bearer ${owner}` },
    });

    expect(response.status).toBe(400);
  });

  it("is behind a session and a rate limit, because it confirms an address exists", async () => {
    expect((await app.request("/v1/users/public-key?email=a@b.com")).status).toBe(401);

    app = createApp({
      sql: database,
      serverSecret: "a secret",
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    const owner = await signUp("owner@example.com");

    await app.request("/v1/users/public-key?email=owner@example.com", {
      headers: { authorization: `Bearer ${owner}` },
    });
    const second = await app.request("/v1/users/public-key?email=owner@example.com", {
      headers: { authorization: `Bearer ${owner}` },
    });

    expect(second.status).toBe(429);
  });
});

describe("the key routes", () => {
  it("need a session", async () => {
    expect((await app.request("/v1/keys/graph")).status).toBe(401);
    expect((await app.request("/v1/keys", { method: "POST" })).status).toBe(401);
    expect((await app.request("/v1/keys/share", { method: "POST" })).status).toBe(401);
    expect((await app.request("/v1/keys/revoke", { method: "POST" })).status).toBe(401);
    expect((await app.request("/v1/keys/abc/shares")).status).toBe(401);
  });

  it("refuse a body that is not one", async () => {
    const owner = await signUp("owner@example.com");

    for (const path of ["/v1/keys", "/v1/keys/share", "/v1/keys/revoke"]) {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${owner}` },
        body: "{ not json",
      });

      expect(response.status).toBe(400);
    }
  });
});
