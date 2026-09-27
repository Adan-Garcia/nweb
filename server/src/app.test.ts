// @vitest-environment node
//
// Node, not jsdom: this is a server, and the database it talks to is a real Postgres
// running in this process.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

const SERVER_SECRET = "a secret this server keeps";

/** What a client sends after `createAccountKeys`. The values are opaque to the server. */
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

const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

async function registerAndSignIn(overrides: Partial<typeof ENROLMENT> = {}) {
  const enrolment = { ...ENROLMENT, ...overrides };
  await post("/v1/auth/register", enrolment);

  const response = await post("/v1/auth/session", {
    email: enrolment.email,
    authKey: enrolment.authKey,
  });

  return (await response.json()) as { token: string; userId: string };
}

beforeEach(async () => {
  database = await createTestDb();
  app = createApp({
    sql: database,
    serverSecret: SERVER_SECRET,
    allowedOrigins: ["http://localhost:5173"],
    // A generous window, so only the test that is about the limiter meets it.
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });
});

afterEach(async () => {
  await database.close();
});

describe("registering", () => {
  it("takes the enrolment and stores nothing it could open", async () => {
    const response = await post("/v1/auth/register", ENROLMENT);

    expect(response.status).toBe(201);

    const { rows } = await database.query<Record<string, string>>("select * from users");
    expect(rows).toHaveLength(1);
    // The proof is hashed again before it is stored, so a leaked table is not a pile of
    // working credentials. Argon2id, which is the library's default and is pinned here.
    expect(rows[0].auth_hash).not.toBe(ENROLMENT.authKey);
    expect(rows[0].auth_hash).toContain("$argon2id$");
    // And the sealed material is kept exactly as it arrived.
    expect(rows[0].sealed_account_key).toBe(ENROLMENT.sealedAccountKey);
  });

  it("refuses a second account for one address, whatever its case", async () => {
    expect((await post("/v1/auth/register", ENROLMENT)).status).toBe(201);

    const again = await post("/v1/auth/register", {
      ...ENROLMENT,
      email: "STUDENT@Example.com",
    });

    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "email_taken" });
  });

  it("refuses a request that is not one", async () => {
    const response = await post("/v1/auth/register", { email: "not an address" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("prelogin", () => {
  it("gives a real account the parameters it registered with", async () => {
    await post("/v1/auth/register", ENROLMENT);

    const response = await post("/v1/auth/prelogin", { email: ENROLMENT.email });

    expect(await response.json()).toEqual({ kdf: ENROLMENT.kdf });
  });

  it("answers for an address it has never seen, so this is not a list of who has an account", async () => {
    const response = await post("/v1/auth/prelogin", { email: "nobody@example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kdf: { name: "Argon2id", memorySize: 65_536, iterations: 3 },
    });
  });

  it("gives the same decoy every time, because two different answers would be the tell", async () => {
    const first = await (await post("/v1/auth/prelogin", { email: "nobody@example.com" })).json();
    const second = await (await post("/v1/auth/prelogin", { email: "nobody@example.com" })).json();

    expect(first).toEqual(second);
  });

  it("gives different decoys to different addresses", async () => {
    const first = await (await post("/v1/auth/prelogin", { email: "one@example.com" })).json();
    const second = await (await post("/v1/auth/prelogin", { email: "two@example.com" })).json();

    expect(first).not.toEqual(second);
  });
});

describe("signing in", () => {
  it("returns a session and the material only the passphrase opens", async () => {
    await post("/v1/auth/register", ENROLMENT);

    const response = await post("/v1/auth/session", {
      email: ENROLMENT.email,
      authKey: ENROLMENT.authKey,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      email: ENROLMENT.email,
      keyMaterial: {
        kdf: ENROLMENT.kdf,
        sealedAccountKey: ENROLMENT.sealedAccountKey,
        sealedPrivateKey: ENROLMENT.sealedPrivateKey,
        publicKey: ENROLMENT.publicKey,
      },
    });
  });

  it("says the same thing to a wrong proof and to an address with no account", async () => {
    await post("/v1/auth/register", ENROLMENT);

    const wrongKey = await post("/v1/auth/session", {
      email: ENROLMENT.email,
      authKey: "d3Jvbmcta2V5",
    });
    const noAccount = await post("/v1/auth/session", {
      email: "nobody@example.com",
      authKey: ENROLMENT.authKey,
    });

    expect(wrongKey.status).toBe(401);
    expect(noAccount.status).toBe(401);
    expect(await wrongKey.json()).toEqual(await noAccount.json());
  });

  it("stores the token hashed, so the table is not a set of live sessions", async () => {
    const { token } = await registerAndSignIn();

    const { rows } = await database.query<{ token_hash: string }>("select * from sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
  });
});

describe("the authenticated routes", () => {
  it("hand back the key material to a session and to nobody else", async () => {
    const { token } = await registerAndSignIn();

    const withToken = await app.request("/v1/keys", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(withToken.status).toBe(200);
    expect(await withToken.json()).toMatchObject({ publicKey: ENROLMENT.publicKey });

    expect((await app.request("/v1/keys")).status).toBe(401);
    expect(
      (await app.request("/v1/keys", { headers: { authorization: "Bearer nonsense" } })).status,
    ).toBe(401);
  });

  it("stop working once the session is ended", async () => {
    const { token } = await registerAndSignIn();

    const ended = await app.request("/v1/auth/session", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ended.status).toBe(204);

    expect(
      (await app.request("/v1/keys", { headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(401);
  });
});

describe("changing a passphrase", () => {
  const next = {
    currentAuthKey: ENROLMENT.authKey,
    nextAuthKey: "bmV4dC1hdXRoLWtleS12YWx1ZQ",
    kdf: { ...ENROLMENT.kdf, salt: "bmV3LXNhbHQtZm9yLXRoaXMtb25l" },
    sealedAccountKey: "cmUtd3JhcHBlZC1hY2NvdW50LWtleQ",
  };

  it("re-wraps the account key and leaves everything it protects alone", async () => {
    const { token } = await registerAndSignIn();

    const response = await post("/v1/auth/passphrase", next, token);
    expect(response.status).toBe(204);

    const material = await (
      await app.request("/v1/keys", { headers: { authorization: `Bearer ${token}` } })
    ).json();

    expect(material).toMatchObject({
      sealedAccountKey: next.sealedAccountKey,
      kdf: next.kdf,
      // Untouched: other people already share with this key, and the content is under an
      // account key that did not change.
      publicKey: ENROLMENT.publicKey,
      sealedPrivateKey: ENROLMENT.sealedPrivateKey,
    });
  });

  it("only the new proof works afterwards", async () => {
    const { token } = await registerAndSignIn();
    await post("/v1/auth/passphrase", next, token);

    const old = await post("/v1/auth/session", {
      email: ENROLMENT.email,
      authKey: ENROLMENT.authKey,
    });
    const now = await post("/v1/auth/session", {
      email: ENROLMENT.email,
      authKey: next.nextAuthKey,
    });

    expect(old.status).toBe(401);
    expect(now.status).toBe(200);
  });

  it("drops every other session, because the old passphrase is usually why", async () => {
    await registerAndSignIn();
    const second = await post("/v1/auth/session", {
      email: ENROLMENT.email,
      authKey: ENROLMENT.authKey,
    });
    const other = (await second.json()) as { token: string };
    const keeping = await registerAndSignIn();

    await post("/v1/auth/passphrase", next, keeping.token);

    expect(
      (await app.request("/v1/keys", { headers: { authorization: `Bearer ${other.token}` } }))
        .status,
    ).toBe(401);
    expect(
      (await app.request("/v1/keys", { headers: { authorization: `Bearer ${keeping.token}` } }))
        .status,
    ).toBe(200);
  });

  it("refuses the wrong current proof", async () => {
    const { token } = await registerAndSignIn();

    const response = await post(
      "/v1/auth/passphrase",
      { ...next, currentAuthKey: "d3Jvbmc" },
      token,
    );

    expect(response.status).toBe(401);
  });
});

describe("a server that only takes the accounts it was told to", () => {
  it("registers a listed address, whatever its case, and refuses any other", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      registrationEmails: ["student@example.com"],
    });

    expect(
      (await post("/v1/auth/register", { ...ENROLMENT, email: "Student@Example.com" })).status,
    ).toBe(201);

    const refused = await post("/v1/auth/register", {
      ...ENROLMENT,
      email: "stranger@example.com",
    });

    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: "registration_closed" });
    expect((await database.query("select * from users")).rows).toHaveLength(1);
  });
});

describe("what an account may be made with", () => {
  it("refuses key material another device would be weakened, or stalled, by", async () => {
    // Every device that signs in derives its proof with these, then sends the proof here.
    // Parameters this cheap would make that proof a quick route back to the passphrase.
    for (const kdf of [
      { ...ENROLMENT.kdf, memorySize: 8 },
      { ...ENROLMENT.kdf, iterations: 1 },
      { ...ENROLMENT.kdf, memorySize: 4_194_304 },
      // A salt the client's own floor would refuse later: the account could never sign in.
      { ...ENROLMENT.kdf, salt: "c2FsdA" },
      { ...ENROLMENT.kdf, salt: "not base64 at all!" },
      { name: "PBKDF2", hash: "SHA-256", iterations: 1, salt: "c2FsdA" },
    ]) {
      const response = await post("/v1/auth/register", { ...ENROLMENT, kdf });

      expect({ kdf, status: response.status }).toEqual({ kdf, status: 400 });
    }
  });

  it("refuses a field far larger than any real one", async () => {
    const response = await post("/v1/auth/register", {
      ...ENROLMENT,
      authKey: "a".repeat(100_000),
    });

    expect(response.status).toBe(400);
  });

  it("refuses a weakened passphrase change", async () => {
    const { token } = await registerAndSignIn();

    const response = await post(
      "/v1/auth/passphrase",
      {
        currentAuthKey: ENROLMENT.authKey,
        nextAuthKey: "bmV4dC1hdXRoLWtleQ",
        kdf: { ...ENROLMENT.kdf, memorySize: 8, iterations: 1 },
        sealedAccountKey: ENROLMENT.sealedAccountKey,
      },
      token,
    );

    expect(response.status).toBe(400);
  });
});

describe("deleting an account", () => {
  const remove = (body: unknown, token?: string) =>
    app.request("/v1/auth/account", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  async function seedOwned(userId: string, otherId: string) {
    await database.query(
      "insert into keys (id, owner_id, kind) values ('wing-1', $1, 'wing'), ('branch-1', $1, 'branch')",
      [userId],
    );
    await database.query(
      "insert into key_wraps (parent_key_id, child_key_id, wrapped) values ('wing-1', 'branch-1', 'd3JhcA')",
    );
    // A course this user shared with somebody else.
    await database.query(
      "insert into grants (key_id, user_id, role, wrapped) values ('branch-1', $1, 'reader', 'Z3JhbnQ')",
      [otherId],
    );
    await database.query(
      `insert into rows (user_id, store, id, updated_at, key_id, encryption, payload)
       values ($1, 'twigs', 'twig-1', 1, 'branch-1', 'aes-gcm', 'c2VhbGVk')`,
      [userId],
    );
  }

  it("erases the account and everything it owns, and nobody else's", async () => {
    const { token, userId } = await registerAndSignIn();
    const other = await registerAndSignIn({ email: "friend@example.com" });
    await seedOwned(userId, other.userId);

    const response = await remove({ authKey: ENROLMENT.authKey }, token);
    expect(response.status).toBe(204);

    for (const table of ["users", "sessions", "rows", "keys", "key_wraps", "grants"]) {
      const { rows } = await database.query<{ count: number }>(
        `select count(*)::int as count from ${table}`,
      );
      // The friend is still a user with a session; nothing else of either survives.
      const expected = table === "users" || table === "sessions" ? 1 : 0;
      expect({ table, count: rows[0].count }).toEqual({ table, count: expected });
    }

    // The old session no longer opens anything, and the address can sign up again.
    expect(
      (await app.request("/v1/keys", { headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(401);
    expect((await post("/v1/auth/register", ENROLMENT)).status).toBe(201);
  });

  it("refuses without the passphrase's proof, even with a session", async () => {
    const { token } = await registerAndSignIn();

    expect((await remove({ authKey: "d3Jvbmc" }, token)).status).toBe(401);
    expect((await remove({}, token)).status).toBe(400);
    expect(
      (
        await app.request("/v1/auth/account", {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
          body: "not json",
        })
      ).status,
    ).toBe(400);

    const { rows } = await database.query<{ count: number }>(
      "select count(*)::int as count from users",
    );
    expect(rows[0].count).toBe(1);
  });

  it("refuses without a session", async () => {
    await registerAndSignIn();

    expect((await remove({ authKey: ENROLMENT.authKey })).status).toBe(401);
  });
});

describe("rate limiting", () => {
  it("stops a run of attempts against one address", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    });
    await post("/v1/auth/register", ENROLMENT);

    const attempt = () => post("/v1/auth/session", { email: ENROLMENT.email, authKey: "d3Jvbmc" });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it("counts an address however it is capitalised, since the account does", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    });
    await post("/v1/auth/register", ENROLMENT);

    const attempt = (email: string) => post("/v1/auth/session", { email, authKey: "d3Jvbmc" });

    expect((await attempt("student@example.com")).status).toBe(401);
    expect((await attempt("Student@Example.com")).status).toBe(401);
    expect((await attempt("STUDENT@EXAMPLE.COM")).status).toBe(429);
  });

  it("stops a run of registrations for one address", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    });

    expect((await post("/v1/auth/register", ENROLMENT)).status).toBe(201);
    expect((await post("/v1/auth/register", ENROLMENT)).status).toBe(409);
    expect(
      (await post("/v1/auth/register", { ...ENROLMENT, email: "Student@example.com" })).status,
    ).toBe(429);
  });

  it("stops one address working through many accounts, behind a tunnel", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      clientIpHeader: "cf-connecting-ip",
      addressLimiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    });

    const ask = (email: string, address: string) =>
      app.request("/v1/auth/prelogin", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": address },
        body: JSON.stringify({ email }),
      });

    expect((await ask("one@example.com", "203.0.113.7")).status).toBe(200);
    expect((await ask("two@example.com", "203.0.113.7")).status).toBe(200);
    expect((await ask("three@example.com", "203.0.113.7")).status).toBe(429);
    // Somebody else, from somewhere else, is not held up by it.
    expect((await ask("three@example.com", "198.51.100.4")).status).toBe(200);
  });

  it("stops a stolen session from guessing its way to a delete", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    });
    const { token } = await registerAndSignIn();
    const guess = () =>
      app.request("/v1/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ authKey: "d3Jvbmc" }),
      });

    expect((await guess()).status).toBe(401);
    expect((await guess()).status).toBe(401);
    expect((await guess()).status).toBe(429);
  });

  it("stops a run of prelogins too, or the decoy is only a speed bump", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    const ask = () => post("/v1/auth/prelogin", { email: "someone@example.com" });

    // A decoy that answers for every address is worth nothing if a list can be ground
    // through it: the tell would be how long it took, not what came back.
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
  });
});

describe("every response", () => {
  it("says it is not to be framed, sniffed or fetched over http", async () => {
    const response = await post("/v1/auth/prelogin", { email: "nobody@example.com" });

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toMatch(/max-age=/);
  });
});

describe("requests too large to be real", () => {
  const sized = (path: string, bytes: number, method = "POST", token?: string) =>
    app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        "content-length": String(bytes),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: "x".repeat(bytes),
    });

  it("are refused before they are read, whatever the route", async () => {
    // Nothing on these routes is more than a few kilobytes. A megabyte is somebody filling
    // the server's memory one request at a time.
    expect((await sized("/v1/auth/prelogin", 2 * 1024 * 1024)).status).toBe(413);
    expect((await sized("/v1/auth/session", 2 * 1024 * 1024)).status).toBe(413);
  });

  it("allow a sync page and a file their own, larger, room", async () => {
    const { token } = await registerAndSignIn();

    // Big enough to be refused anywhere else; well inside what a page of notes may be.
    expect((await sized("/v1/sync", 2 * 1024 * 1024, "POST", token)).status).toBe(400);
    expect((await sized("/v1/sync", 65 * 1024 * 1024, "POST", token)).status).toBe(413);
    expect((await sized("/v1/media/file-1", 26 * 1024 * 1024, "PUT", token)).status).toBe(413);
  });
});

describe("requests that are not requests", () => {
  const malformed = (path: string, token?: string) =>
    app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: "{ this is not json",
    });

  it("are refused rather than crashing the route", async () => {
    expect((await malformed("/v1/auth/prelogin")).status).toBe(400);
    expect((await malformed("/v1/auth/register")).status).toBe(400);
    expect((await malformed("/v1/auth/session")).status).toBe(400);
  });

  it("are refused on the authenticated routes too, once the session checks out", async () => {
    const { token } = await registerAndSignIn();

    expect((await malformed("/v1/auth/passphrase", token)).status).toBe(400);
  });

  it("are refused before the session is even looked at when there is no session", async () => {
    expect((await malformed("/v1/auth/passphrase")).status).toBe(401);
  });

  it("refuse a session route with a header that is not a bearer token", async () => {
    const response = await app.request("/v1/keys", { headers: { authorization: "Basic abc" } });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("refuse ending a session without one", async () => {
    expect((await app.request("/v1/auth/session", { method: "DELETE" })).status).toBe(401);
  });

  it("refuse an expired session", async () => {
    const { token } = await registerAndSignIn();

    await database.query("update sessions set expires_at = $1", [new Date(0).toISOString()]);

    expect(
      (await app.request("/v1/keys", { headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(401);
  });
});

describe("the push key", () => {
  it("is served to anybody, because that is what a public key is for", async () => {
    app = createApp({
      sql: database,
      serverSecret: SERVER_SECRET,
      allowedOrigins: [],
      vapidPublicKey: "a-vapid-public-key",
    });

    const response = await app.request("/v1/push/key");

    // No session: it is the same key for everybody, and putting it behind a sign-in would
    // only mean a device could not find out whether reminders exist before signing in.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: "a-vapid-public-key" });
  });

  it("is null when this deployment sends no reminders", async () => {
    const response = await app.request("/v1/push/key");

    // A choice, not a failure: the app offers nothing rather than a switch that cannot work.
    expect(await response.json()).toEqual({ publicKey: null });
  });
});

describe("cross-origin requests", () => {
  it("are answered for an allowed origin and not for another", async () => {
    const allowed = await app.request("/v1/auth/prelogin", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });
    const other = await app.request("/v1/auth/prelogin", {
      method: "OPTIONS",
      headers: {
        origin: "https://somewhere.example",
        "access-control-request-method": "POST",
      },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(other.headers.get("access-control-allow-origin")).not.toBe("https://somewhere.example");
  });
});
