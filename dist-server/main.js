import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { createHash, createHmac, randomBytes } from "node:crypto";
import webpush from "web-push";
//#region shared/kdf-params.ts
/**
 * How a passphrase becomes key material, as it travels.
 *
 * This lives in `shared/` because it is on the wire: a device that has never seen this
 * workspace has to be handed these parameters before it can derive anything, so the server
 * stores them and gives them back at sign-in. It does not know what they are for and could
 * not use them if it did — they are the public half of the derivation, and the passphrase
 * they go with never leaves the device.
 *
 * Deriving from them is `src/lib/kdf.ts`. Only the shape is shared.
 */
var pbkdf2ParamsSchema = z.object({
  name: z.literal("PBKDF2"),
  hash: z.literal("SHA-256"),
  iterations: z.number().int().positive(),
  salt: z.string(),
});
var argon2idParamsSchema = z.object({
  name: z.literal("Argon2id"),
  /** KiB the hash has to fill. Memory is what costs an attacker with GPUs their advantage. */
  memorySize: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  salt: z.string(),
});
var kdfParamsSchema = z.discriminatedUnion("name", [pbkdf2ParamsSchema, argon2idParamsSchema]);
/**
 * OWASP's 2023 Argon2id recommendation: 64 MiB, three passes, one lane. The memory is the
 * point — PBKDF2 at any iteration count is cheap to parallelise on a GPU, and 64 MiB per
 * guess is not. It costs about 150ms on a laptop, which is paid once per unlock.
 *
 * Shared because a server that does not know an email has to answer with parameters that
 * look exactly like a real account's, and "exactly" includes the cost.
 */
var ARGON2ID_DEFAULTS = {
  memorySize: 65536,
  iterations: 3,
  parallelism: 1,
};
//#endregion
//#region shared/account-contract.ts
/**
 * What an account looks like on the wire.
 *
 * Every field here is something the server is allowed to hold. What it never receives is
 * the passphrase, or anything that can be turned back into one: `authKey` is one half of a
 * derivation whose other half stays on the device, and the sealed blobs are AES-GCM
 * ciphertext under a key the server has no part of.
 *
 * The server's job with all of it is to hand the same bytes back to a device that proves
 * it knows the passphrase. It cannot open them, and does not need to.
 */
var base64 = z.string().min(1);
/** Base64, and long enough that a truncated one is rejected rather than stored. */
var sealed = z.string().min(16);
var registerRequestSchema = z.object({
  email: z.email(),
  /**
   * Proof of the passphrase, and nothing else derivable from it. The server hashes this
   * again before storing it — it is a password as far as the server is concerned, and it
   * must not be usable as one if the database leaks.
   */
  authKey: base64,
  /** So a second device can derive the same thing from the same passphrase. */
  kdf: kdfParamsSchema,
  /** The account key, sealed under a key derived beside `authKey` and never sent. */
  sealedAccountKey: sealed,
  /** This user's public key, which is how anyone shares anything with them. */
  publicKey: base64,
  /** Their private key, sealed under the account key. */
  sealedPrivateKey: sealed,
});
/**
 * Before a device can prove a passphrase it has to know what to derive with, and it has
 * only an email to ask by. Answering "no such account" here would turn this into a list of
 * who has one, so the server answers every address: a real account's parameters, or decoys
 * derived from the address and a server secret, which are stable per address and
 * indistinguishable from the real thing.
 */
var preloginRequestSchema = z.object({ email: z.email() });
z.object({ kdf: kdfParamsSchema });
var sessionRequestSchema = z.object({
  email: z.email(),
  authKey: base64,
});
/**
 * What a device needs before it can ask for the passphrase: the parameters to derive with,
 * and the sealed material to try the result against. Handed out on sign-in, and on the
 * lookup a second device does before it has a session.
 */
var accountKeyMaterialSchema = z.object({
  kdf: kdfParamsSchema,
  sealedAccountKey: sealed,
  publicKey: base64,
  sealedPrivateKey: sealed,
});
z.object({
  userId: z.uuid(),
  email: z.email(),
  /** Opaque to the client; it goes back in the Authorization header and nowhere else. */
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
  keyMaterial: accountKeyMaterialSchema,
});
/**
 * Changing a passphrase re-seals one small blob and re-proves the new one. It does not
 * touch a single note, which is the whole reason the account key is a key of its own
 * rather than something derived from the passphrase directly.
 */
var changePassphraseRequestSchema = z.object({
  currentAuthKey: base64,
  nextAuthKey: base64,
  kdf: kdfParamsSchema,
  sealedAccountKey: sealed,
});
z.object({
  error: z.enum([
    "invalid_request",
    "email_taken",
    "invalid_credentials",
    "unauthorized",
    "too_large",
    "rate_limited",
  ]),
  message: z.string(),
});
//#endregion
//#region server/src/db.ts
/**
 * Applied statement by statement rather than as one script, because a multi-statement
 * query is a simple query and not every driver will take one.
 *
 * What the server stores is what it cannot read: a hash of the proof, and four opaque
 * strings. There is no column here for anything it could open.
 */
var SCHEMA_STATEMENTS = [
  `create table if not exists users (
     id uuid primary key default gen_random_uuid(),
     email text not null unique,
     auth_hash text not null,
     kdf jsonb not null,
     sealed_account_key text not null,
     public_key text not null,
     sealed_private_key text not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id uuid not null references users(id) on delete cascade,
     expires_at timestamptz not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists sessions_user_id_idx on sessions (user_id)`,
  `create index if not exists sessions_expires_at_idx on sessions (expires_at)`,
  `create sequence if not exists rows_seq`,
  `create table if not exists rows (
     user_id uuid not null references users(id) on delete cascade,
     store text not null,
     id text not null,
     seq bigint not null default nextval('rows_seq'),
     updated_at bigint not null,
     deleted_at bigint,
     key_id text not null default '',
     encryption text not null default 'none',
     payload text not null,
     due_date text,
     due_minutes int,
     time_zone text,
     status text,
     primary key (user_id, store, id)
   )`,
  `create index if not exists rows_user_seq_idx on rows (user_id, seq)`,
  `create index if not exists rows_due_idx on rows (due_date)
     where due_date is not null and deleted_at is null`,
  `create table if not exists keys (
     id text primary key,
     owner_id uuid not null references users(id) on delete cascade,
     kind text not null,
     rotated_from text,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists key_wraps (
     parent_key_id text not null,
     child_key_id text not null,
     wrapped text not null,
     primary key (parent_key_id, child_key_id)
   )`,
  `create index if not exists key_wraps_parent_idx on key_wraps (parent_key_id)`,
  `create table if not exists grants (
     key_id text not null,
     user_id uuid not null references users(id) on delete cascade,
     role text not null,
     wrapped text not null,
     primary key (key_id, user_id)
   )`,
  `create index if not exists grants_user_idx on grants (user_id)`,
  `create table if not exists push_subscriptions (
     user_id uuid not null references users(id) on delete cascade,
     endpoint text not null,
     p256dh text not null,
     auth text not null,
     created_at timestamptz not null default now(),
     primary key (user_id, endpoint)
   )`,
  `alter table rows add column if not exists reminded_at bigint`,
  `create table if not exists media (
     user_id uuid not null references users(id) on delete cascade,
     id text not null,
     seq bigint not null default nextval('rows_seq'),
     mime_type text not null,
     created bigint not null,
     updated_at bigint not null,
     key_id text not null default '',
     encryption text not null default 'none',
     bytes bytea not null,
     primary key (user_id, id)
   )`,
];
async function migrate(sql) {
  for (const statement of SCHEMA_STATEMENTS) await sql.query(statement);
}
/**
 * An address identifies an account, so it has to identify exactly one. Postgres compares
 * text byte by byte, which would let `A@b.com` and `a@b.com` both be registered.
 */
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
//#endregion
//#region server/src/tokens.ts
/**
 * Session tokens, and the reason they are stored hashed but not slowly hashed.
 *
 * A passphrase needs Argon2id because it is guessable. A token is 256 bits from the
 * system's random source, so there is nothing to guess and no dictionary to run — SHA-256
 * is enough to stop a leaked database being a pile of working sessions, and adding a slow
 * hash would only make every authenticated request expensive.
 *
 * There is no constant-time compare here either, and deliberately: a token is never
 * compared: it is hashed and looked up by primary key, so what an attacker could time is a
 * b-tree probe for the SHA-256 of a value they would have had to guess already.
 */
var TOKEN_BYTES = 32;
var SESSION_TTL_MS = 2592e6;
function issueToken() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
  };
}
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
/** The bearer token from an Authorization header, or null if there is not one. */
function bearerToken(header) {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}
//#endregion
//#region server/src/accounts.ts
/**
 * Accounts, which here means: keep a proof of a passphrase, and keep four strings that
 * only the passphrase opens.
 *
 * The server is lighter on the proof than the client is on the passphrase, and on purpose.
 * `authKey` is already 256 bits of HKDF output, so there is no dictionary to run against
 * it; hashing it again is insurance against a leaked table being a pile of usable
 * credentials, not against someone guessing "password". The expensive derivation is the
 * one that happened on the device.
 */
var ARGON2_SERVER = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
function materialFrom(row) {
  return {
    kdf: row.kdf,
    sealedAccountKey: row.sealed_account_key,
    publicKey: row.public_key,
    sealedPrivateKey: row.sealed_private_key,
  };
}
async function findByEmail(sql, email) {
  const { rows } = await sql.query("select * from users where email = $1", [normalizeEmail(email)]);
  return rows[0] ?? null;
}
/**
 * Parameters for an address the server has never seen, derived from the address and a
 * secret so they are the same every time it is asked. A random salt per request would be
 * a tell: two probes for one address would disagree, and a real account's would not.
 */
function decoyKdf(email, serverSecret) {
  const salt = createHmac("sha256", serverSecret)
    .update(`kdf-decoy:${normalizeEmail(email)}`)
    .digest()
    .subarray(0, 16)
    .toString("base64");
  return {
    name: "Argon2id",
    ...ARGON2ID_DEFAULTS,
    salt,
  };
}
async function prelogin(sql, email, serverSecret) {
  const user = await findByEmail(sql, email);
  return { kdf: user ? user.kdf : decoyKdf(email, serverSecret) };
}
async function register(sql, request) {
  const email = normalizeEmail(request.email);
  if (await findByEmail(sql, email)) return { error: "email_taken" };
  const authHash = await hash(request.authKey, ARGON2_SERVER);
  const { rows } = await sql.query(
    `insert into users (email, auth_hash, kdf, sealed_account_key, public_key, sealed_private_key)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (email) do nothing
     returning id`,
    [
      email,
      authHash,
      JSON.stringify(request.kdf),
      request.sealedAccountKey,
      request.publicKey,
      request.sealedPrivateKey,
    ],
  );
  return rows[0] ? { userId: rows[0].id } : { error: "email_taken" };
}
/**
 * Null covers both an address with no account and the wrong proof for one that exists.
 * Telling them apart is a list of who has an account, and the caller has nothing different
 * to do about either.
 */
async function createSession(sql, request, now = Date.now()) {
  const user = await findByEmail(sql, request.email);
  if (!user || !(await verifyAuthKey(request.authKey, user.auth_hash))) return null;
  const { token, tokenHash } = issueToken();
  const expiresAt = now + SESSION_TTL_MS;
  await sql.query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [
    tokenHash,
    user.id,
    new Date(expiresAt).toISOString(),
  ]);
  return {
    userId: user.id,
    email: user.email,
    token,
    expiresAt,
    keyMaterial: materialFrom(user),
  };
}
/** A wrong proof is a false, not a throw: a malformed hash in the table is still a no. */
async function verifyAuthKey(authKey, authHash) {
  try {
    return await verify(authHash, authKey);
  } catch {
    return false;
  }
}
async function userForToken(sql, token, now = Date.now()) {
  const { rows } = await sql.query(
    `select users.* from sessions
     join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > $2`,
    [hashToken(token), new Date(now).toISOString()],
  );
  return rows[0] ?? null;
}
async function endSession(sql, token) {
  await sql.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}
function keyMaterialFor(user) {
  return materialFrom(user);
}
/**
 * A new passphrase over the same account. The account key is unchanged — only the wrapping
 * of it is — so nothing this user has stored is touched, whatever there is of it.
 *
 * Every other session is dropped. A passphrase is usually changed because the old one is
 * suspect, and leaving the sessions it opened alive would make the change decorative.
 */
async function changePassphrase(sql, user, request, keepToken) {
  if (!(await verifyAuthKey(request.currentAuthKey, user.auth_hash))) return false;
  await sql.query(
    `update users set auth_hash = $1, kdf = $2, sealed_account_key = $3, updated_at = now()
     where id = $4`,
    [
      await hash(request.nextAuthKey, ARGON2_SERVER),
      JSON.stringify(request.kdf),
      request.sealedAccountKey,
      user.id,
    ],
  );
  await sql.query("delete from sessions where user_id = $1 and token_hash <> $2", [
    user.id,
    hashToken(keepToken),
  ]);
  return true;
}
//#endregion
//#region server/src/http.ts
/**
 * The two things every route group needs: the one error shape, and the answer to "who is
 * calling". Both live here rather than in a route module so that no group can quietly grow
 * a second way of saying no.
 */
var ERRORS = {
  invalid_request: {
    status: 400,
    message: "That request is not one this server understands.",
  },
  too_large: {
    status: 413,
    message: "That file is larger than this server will store.",
  },
  email_taken: {
    status: 409,
    message: "That address already has an account.",
  },
  invalid_credentials: {
    status: 401,
    message: "That email and passphrase do not match.",
  },
  unauthorized: {
    status: 401,
    message: "This request needs a valid session.",
  },
  rate_limited: {
    status: 429,
    message: "Too many attempts. Wait a minute and try again.",
  },
};
function fail(error) {
  const { status, message } = ERRORS[error];
  return Response.json(
    {
      error,
      message,
    },
    { status },
  );
}
/** 204: the answer to everything this server does but cannot describe. */
var noContent = () => new Response(null, { status: 204 });
/** The session behind a request, or null — which every authenticated route turns into a 401. */
async function callerFor(sql, header) {
  const token = bearerToken(header);
  if (!token) return null;
  const user = await userForToken(sql, token);
  return user
    ? {
        token,
        user,
      }
    : null;
}
//#endregion
//#region server/src/auth-routes.ts
/**
 * An account is a proof of a passphrase and four strings this server cannot open. Every
 * route here either checks the proof or hands those strings back.
 */
function authRoutes({ sql, serverSecret, attempts }) {
  const routes = new Hono();
  routes.post("/v1/auth/prelogin", async (context) => {
    const parsed = preloginRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    if (attempts.isLimited(`prelogin:${parsed.data.email}`)) return fail("rate_limited");
    return Response.json(await prelogin(sql, parsed.data.email, serverSecret));
  });
  routes.post("/v1/auth/register", async (context) => {
    const parsed = registerRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    const outcome = await register(sql, parsed.data);
    return "error" in outcome ? fail(outcome.error) : Response.json(outcome, { status: 201 });
  });
  routes.post("/v1/auth/session", async (context) => {
    const parsed = sessionRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    if (attempts.isLimited(`session:${parsed.data.email}`)) return fail("rate_limited");
    const session = await createSession(sql, parsed.data);
    return session ? Response.json(session) : fail("invalid_credentials");
  });
  routes.delete("/v1/auth/session", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    await endSession(sql, caller.token);
    return noContent();
  });
  /** The sealed key material for this account: bytes only the passphrase opens. */
  routes.get("/v1/keys", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    return Response.json(keyMaterialFor(caller.user));
  });
  routes.post("/v1/auth/passphrase", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = changePassphraseRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) return fail("invalid_request");
    return (await changePassphrase(sql, caller.user, parsed.data, caller.token))
      ? noContent()
      : fail("invalid_credentials");
  });
  return routes;
}
//#endregion
//#region server/src/rate-limit.ts
function createRateLimiter({ limit, windowMs }) {
  const windows = /* @__PURE__ */ new Map();
  return {
    isLimited(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        for (const [existing, window] of windows)
          if (window.resetAt <= now) windows.delete(existing);
        windows.set(key, {
          count: 1,
          resetAt: now + windowMs,
        });
        return false;
      }
      current.count += 1;
      return current.count > limit;
    },
  };
}
//#endregion
//#region shared/sharing-contract.ts
/**
 * Sharing, which here is entirely a question of who can derive which key.
 *
 * Sharing has to work at any level — a wing, a term, a course, a tag, or one note handed
 * to one person — and a nest is a tag, so what contains what is a graph and not a tree. The
 * model that survives that is envelope encryption over the graph:
 *
 *   - every leaf (a note, a task, a file) has a data key of its own;
 *   - every container (a wing, flight, branch, nest) has a key that encrypts no content and
 *     exists only to wrap the keys beneath it;
 *   - an edge is a wrapped key: the child's, sealed under the parent's;
 *   - a share is one more wrap, this time under the recipient's public key.
 *
 * To read one thing a client walks: its own private key, the grants it holds, down the
 * wraps, to the key it needs. The server holds every one of those wraps and can open none
 * of them.
 */
var KEY_KINDS = ["wing", "flight", "branch", "nest", "feather", "twig", "pebble"];
/** What a share lets someone do. Reading is the hard part; writing is a server check. */
var SHARE_ROLES = ["reader", "writer"];
var keyRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(KEY_KINDS),
  /** Set when this key replaced another, so a rotation leaves a trail rather than a gap. */
  rotatedFrom: z.string().nullable(),
});
/** A child key sealed under its parent's. The bytes are meaningless without the parent. */
var keyWrapSchema = z.object({
  parentKeyId: z.string().min(1),
  childKeyId: z.string().min(1),
  wrapped: z.string().min(1),
});
/** A key sealed under someone's public key: the one edge that crosses between people. */
var grantSchema = z.object({
  keyId: z.string().min(1),
  role: z.enum(SHARE_ROLES),
  wrapped: z.string().min(1),
});
z.object({
  keys: z.array(keyRecordSchema),
  wraps: z.array(keyWrapSchema),
  grants: z.array(grantSchema),
});
/**
 * Creating keys and edges. A client sends what it has just generated; the server stores
 * bytes it cannot read and enforces only that they belong to someone who already had the
 * key being wrapped.
 */
var putKeysRequestSchema = z.object({
  keys: z.array(keyRecordSchema).max(200),
  wraps: z.array(keyWrapSchema).max(500),
  /** Grants for this user themselves — how a key they just made becomes reachable. */
  grants: z.array(grantSchema).max(200),
});
var shareRequestSchema = z.object({
  keyId: z.string().min(1),
  /** Who it is for. The wrap was made against the public key this address published. */
  email: z.email(),
  role: z.enum(SHARE_ROLES),
  wrapped: z.string().min(1),
});
var revokeRequestSchema = z.object({
  keyId: z.string().min(1),
  email: z.email(),
});
z.object({
  email: z.email(),
  publicKey: z.string().min(1),
});
z.object({
  shares: z.array(
    z.object({
      email: z.email(),
      role: z.enum(SHARE_ROLES),
    }),
  ),
});
//#endregion
//#region server/src/sharing.ts
/**
 * The key graph, stored by a server that can open none of it.
 *
 * Every row here is either a name for a key, a key sealed under another key, or a key
 * sealed under somebody's public key. The server's whole job is to hand the right subset
 * to the right person: what it must never do is hand someone a wrap whose parent they
 * cannot reach, because that is the only thing standing between "the bytes exist" and "the
 * bytes are readable".
 */
async function putKeys(sql, userId, request) {
  for (const key of request.keys)
    await sql.query(
      `insert into keys (id, owner_id, kind, rotated_from) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [key.id, userId, key.kind, key.rotatedFrom],
    );
  for (const wrap of request.wraps)
    await sql.query(
      `insert into key_wraps (parent_key_id, child_key_id, wrapped) values ($1, $2, $3)
       on conflict (parent_key_id, child_key_id) do update set wrapped = excluded.wrapped`,
      [wrap.parentKeyId, wrap.childKeyId, wrap.wrapped],
    );
  for (const grant of request.grants)
    await sql.query(
      `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
       on conflict (key_id, user_id) do update set
         role = excluded.role, wrapped = excluded.wrapped`,
      [grant.keyId, userId, grant.role, grant.wrapped],
    );
}
/**
 * What this user can walk: the keys granted to them, everything reachable beneath those,
 * and the wraps that get from one to the other.
 *
 * The reachable set is computed here rather than handing over every wrap in the table. A
 * wrap whose parent the caller cannot derive is useless to them, but it is also a fact
 * about somebody else's workspace, and there is no reason to publish it.
 */
async function keyGraphFor(sql, userId) {
  const { rows: grantRows } = await sql.query(
    "select key_id, role, wrapped from grants where user_id = $1",
    [userId],
  );
  const grants = grantRows.map((row) => ({
    keyId: row.key_id,
    role: row.role,
    wrapped: row.wrapped,
  }));
  const { rows: wrapRows } = await sql.query(
    "select parent_key_id, child_key_id, wrapped from key_wraps",
  );
  const byParent = /* @__PURE__ */ new Map();
  for (const wrap of wrapRows)
    byParent.set(wrap.parent_key_id, [...(byParent.get(wrap.parent_key_id) ?? []), wrap]);
  const reachable = new Set(grants.map((grant) => grant.keyId));
  const wraps = [];
  const queue = [...reachable];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor];
    for (const wrap of byParent.get(parent) ?? []) {
      wraps.push({
        parentKeyId: wrap.parent_key_id,
        childKeyId: wrap.child_key_id,
        wrapped: wrap.wrapped,
      });
      if (!reachable.has(wrap.child_key_id)) {
        reachable.add(wrap.child_key_id);
        queue.push(wrap.child_key_id);
      }
    }
  }
  const { rows: keyRows } = await sql.query("select id, kind, rotated_from from keys");
  return {
    keys: keyRows
      .filter((key) => reachable.has(key.id))
      .map((key) => ({
        id: key.id,
        kind: key.kind,
        rotatedFrom: key.rotated_from,
      })),
    wraps,
    grants,
  };
}
/**
 * Hands a key to someone else.
 *
 * The wrap itself was made on the sharer's device against the recipient's published public
 * key, so this stores bytes and checks one thing: that the sharer can reach the key they
 * are giving away. Without that check anyone could grant anyone access to anything, since
 * the wrap is opaque and the server cannot tell a real one from a forgery.
 */
async function share(sql, userId, request) {
  if (!(await keyGraphFor(sql, userId)).keys.some((key) => key.id === request.keyId))
    return "not_yours";
  const { rows } = await sql.query("select id from users where email = $1", [
    normalizeEmail(request.email),
  ]);
  if (!rows[0]) return "no_such_user";
  await sql.query(
    `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
     on conflict (key_id, user_id) do update set role = excluded.role, wrapped = excluded.wrapped`,
    [request.keyId, rows[0].id, request.role, request.wrapped],
  );
  return "shared";
}
/**
 * Takes a key back.
 *
 * The grant goes, so the server will not hand those bytes over again. What it cannot do is
 * unsee what the other person already read — that needs the key rotated and the content
 * re-encrypted, which is the client's job and is why `rotatedFrom` exists.
 */
async function revoke(sql, userId, request) {
  if (!(await keyGraphFor(sql, userId)).keys.some((key) => key.id === request.keyId))
    return "not_yours";
  const { rows } = await sql.query("select id from users where email = $1", [
    normalizeEmail(request.email),
  ]);
  if (!rows[0]) return "no_such_user";
  await sql.query("delete from grants where key_id = $1 and user_id = $2", [
    request.keyId,
    rows[0].id,
  ]);
  return "shared";
}
/** Who this key has been given to, by address. Never the wraps themselves. */
async function sharesOf(sql, userId, keyId) {
  if (!(await keyGraphFor(sql, userId)).keys.some((key) => key.id === keyId)) return null;
  const { rows } = await sql.query(
    `select users.email, grants.role from grants
     join users on users.id = grants.user_id
     where grants.key_id = $1 order by users.email`,
    [keyId],
  );
  return rows;
}
async function publicKeyFor(sql, email) {
  const { rows } = await sql.query("select public_key from users where email = $1", [
    normalizeEmail(email),
  ]);
  return rows[0]?.public_key ?? null;
}
//#endregion
//#region server/src/sharing-routes.ts
/**
 * Who can derive which key. Every refusal here is `invalid_request`: "that key is not
 * yours" and "nobody has that address" are both things the caller can do nothing about,
 * and telling them apart would answer a question about who has an account.
 */
function sharingRoutes({ sql, attempts }) {
  const routes = new Hono();
  routes.get("/v1/keys/graph", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    return Response.json(await keyGraphFor(sql, caller.user.id));
  });
  routes.post("/v1/keys", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = putKeysRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    await putKeys(sql, caller.user.id, parsed.data);
    return noContent();
  });
  routes.post("/v1/keys/share", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = shareRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    return (await share(sql, caller.user.id, parsed.data)) === "shared"
      ? noContent()
      : fail("invalid_request");
  });
  routes.post("/v1/keys/revoke", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = revokeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    return (await revoke(sql, caller.user.id, parsed.data)) === "shared"
      ? noContent()
      : fail("invalid_request");
  });
  routes.get("/v1/keys/:keyId/shares", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const shares = await sharesOf(sql, caller.user.id, context.req.param("keyId"));
    return shares ? Response.json({ shares }) : fail("invalid_request");
  });
  routes.get("/v1/users/public-key", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const email = context.req.query("email") ?? "";
    if (attempts.isLimited(`public-key:${caller.user.id}`)) return fail("rate_limited");
    const publicKey = await publicKeyFor(sql, email);
    return publicKey
      ? Response.json({
          email,
          publicKey,
        })
      : fail("invalid_request");
  });
  return routes;
}
//#endregion
//#region shared/cipher-name.ts
/**
 * Which cipher sealed something. Shared because it travels: a row on the wire says how it
 * was sealed so the device that receives it knows whether it has anything to open.
 *
 * The ciphers themselves are `src/lib/cipher.ts`. Only the name is on the wire, and it
 * tells a server nothing it could act on.
 */
var cipherNameSchema = z.enum(["none", "aes-gcm"]);
//#endregion
//#region shared/sync-contract.ts
/**
 * Sync, as the server sees it.
 *
 * A row arrives as a sealed blob plus the handful of fields the server has a job to do
 * with. It does not learn what a note is called, which course it belongs to or what is in
 * it: `payload` is the whole row, sealed with the key named by `keyId`, and everything
 * outside it is either a timestamp or something a reminder needs.
 *
 * Ordering is the server's, not the client's. `updatedAt` decides which of two versions of
 * a row wins, because that is a fact about the edit. `seq` decides what a device has not
 * seen yet, because clocks on two laptops disagree and a monotonic counter does not.
 */
var SYNC_STORES = [
  "notes-directory",
  "notes-documents",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
];
/**
 * What a server needs to send "something is due at nine" without being able to say what.
 * Null for every row that is not a task. The fields are the ones `sealed-text.ts` leaves
 * in the clear on purpose, and no others have been added to that list.
 */
var scheduleSchema = z
  .object({
    dueDate: z.string().nullable(),
    dueMinutes: z.number().int().min(0).max(1439).nullable(),
    timeZone: z.string(),
    status: z.string(),
  })
  .nullable();
var syncRowSchema = z.object({
  store: z.enum(SYNC_STORES),
  id: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  /** Which key sealed `payload`. Empty when the workspace has no passphrase. */
  keyId: z.string(),
  encryption: cipherNameSchema,
  /** The row itself, sealed and base64'd. Opaque here and on the server. */
  payload: z.string(),
  schedule: scheduleSchema,
});
var syncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  rows: z.array(syncRowSchema).max(200),
});
z.object({
  /** The cursor to send next time. Everything at or below it has been handed over. */
  seq: z.number().int().nonnegative(),
  rows: z.array(syncRowSchema),
  /** True when the server had more than one page to give. */
  hasMore: z.boolean(),
});
var mediaMetaSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string(),
  created: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  keyId: z.string(),
  encryption: cipherNameSchema,
});
z.object({ media: z.array(mediaMetaSchema) });
/**
 * A device asking to be told when something is due.
 *
 * The subscription is the browser's own: an endpoint at a push service and the two keys
 * that service needs to encrypt to it. The server keeps it and nothing else — it cannot
 * say what is due, only that something is (see `BACKEND.md`, "what it costs").
 */
var pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
z.object({ publicKey: z.string().min(1).nullable() });
/** How close a task has to be before it is worth saying anything. */
var REMINDER_WINDOW_MS = 9e5;
//#endregion
//#region server/src/zoned-time.ts
/**
 * Turning a wall clock and a zone into an instant.
 *
 * The client stores a date, minutes past midnight and an IANA zone rather than a
 * timestamp, because the conversion needs real timezone data and has no right answer for
 * the hour DST repeats or skips (`src/lib/due-time.ts` says why). This is where that
 * conversion happens, because this is where the data is.
 *
 * No dependency: `Intl` knows every zone, and what it will not do directly — give the
 * offset for a zone at an instant — falls out of formatting one and reading it back.
 */
var PARTS = /* @__PURE__ */ new Map();
function formatterFor(timeZone) {
  const existing = PARTS.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  PARTS.set(timeZone, formatter);
  return formatter;
}
/** How far this zone is from UTC at this instant, in milliseconds. */
function offsetAt(instant, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const read = (type) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return (
    Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour") % 24,
      read("minute"),
      read("second"),
    ) - instant
  );
}
/**
 * The instant a `YYYY-MM-DD` and a minute count fall on in a zone, or null for anything
 * that is not a date, a minute count, or a zone this runtime knows.
 *
 * Solved rather than looked up: guess that the offset is what it is at the naive instant,
 * correct once, and take the second answer when the two disagree — which is the hour a
 * clock went forward or back. An ambiguous local time resolves to one of its two instants
 * rather than to an error, because a reminder an hour early beats no reminder.
 */
function zonedInstant(dateKey, minutes, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match || minutes < 0 || minutes > 1439) return null;
  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  if (Number.isNaN(naive)) return null;
  try {
    const first = offsetAt(naive, timeZone);
    const guess = naive - first;
    const second = offsetAt(guess, timeZone);
    return second === first ? guess : naive - second;
  } catch {
    return null;
  }
}
//#endregion
//#region server/src/reminders.ts
/**
 * Tasks whose moment has arrived and which nobody has been told about.
 *
 * A task with a date and no time is due at the start of its day, which is what someone
 * means by "Friday" with nothing after it. One whose zone the runtime does not know is
 * skipped rather than guessed at — a reminder at the wrong hour is worse than none.
 */
async function findDueReminders(sql, now, windowMs = REMINDER_WINDOW_MS) {
  const { rows } =
    await sql.query(`select user_id, store, id, due_date, due_minutes, time_zone, reminded_at
     from rows
     where store = 'twigs'
       and deleted_at is null
       and due_date is not null
       and status is distinct from 'complete'`);
  const due = [];
  for (const record of rows) {
    const dueAt = zonedInstant(record.due_date, record.due_minutes ?? 0, record.time_zone || "UTC");
    if (dueAt === null || dueAt > now + windowMs) continue;
    const reminded = record.reminded_at === null ? null : Number(record.reminded_at);
    if (reminded !== null && reminded >= dueAt) continue;
    due.push({
      userId: record.user_id,
      store: record.store,
      id: record.id,
      dueAt,
    });
  }
  return due;
}
async function markReminded(sql, reminder) {
  await sql.query(
    `update rows set reminded_at = $1 where user_id = $2 and store = $3 and id = $4`,
    [reminder.dueAt, reminder.userId, reminder.store, reminder.id],
  );
}
async function subscriptionsFor(sql, userId) {
  const { rows } = await sql.query(
    "select endpoint, p256dh, auth from push_subscriptions where user_id = $1",
    [userId],
  );
  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  }));
}
async function saveSubscription(sql, userId, subscription) {
  await sql.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (user_id, endpoint) do update set
       p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
}
async function forgetSubscription(sql, userId, endpoint) {
  await sql.query("delete from push_subscriptions where user_id = $1 and endpoint = $2", [
    userId,
    endpoint,
  ]);
}
/**
 * Sends one round of reminders.
 *
 * `deliver` is passed in rather than imported so the sweep can be tested without a push
 * service, and so that a dead subscription — a browser that has been uninstalled — can be
 * dropped by whoever knows what the failure meant.
 */
async function sweepReminders(sql, deliver, now = Date.now()) {
  const due = await findDueReminders(sql, now);
  const byUser = /* @__PURE__ */ new Map();
  for (const reminder of due)
    byUser.set(reminder.userId, [...(byUser.get(reminder.userId) ?? []), reminder]);
  let sent = 0;
  let dropped = 0;
  for (const [userId, reminders] of byUser) {
    const subscriptions = await subscriptionsFor(sql, userId);
    const payload = JSON.stringify({
      count: reminders.length,
      dueAt: Math.min(...reminders.map((reminder) => reminder.dueAt)),
    });
    for (const subscription of subscriptions)
      if ((await deliver(subscription, payload)) === "gone") {
        await forgetSubscription(sql, userId, subscription.endpoint);
        dropped += 1;
      } else sent += 1;
    for (const reminder of reminders) await markReminded(sql, reminder);
  }
  return {
    sent,
    dropped,
  };
}
//#endregion
//#region server/src/sync.ts
/** Postgres hands back `bigint` as a string, because it does not fit a JS number safely. */
function toNumber(value) {
  return typeof value === "number" ? value : Number(value);
}
function toSyncRow(record) {
  return {
    store: record.store,
    id: record.id,
    updatedAt: toNumber(record.updated_at),
    deletedAt: record.deleted_at === null ? null : toNumber(record.deleted_at),
    keyId: record.key_id,
    encryption: record.encryption,
    payload: record.payload,
    schedule:
      record.status === null
        ? null
        : {
            dueDate: record.due_date,
            dueMinutes: record.due_minutes,
            timeZone: record.time_zone ?? "",
            status: record.status,
          },
  };
}
/**
 * Applies one row if it is newer than what is stored.
 *
 * The `where` on the conflict is what makes this last-write-wins rather than
 * last-to-arrive-wins: a device that has been offline for a week and is catching up cannot
 * undo an edit made yesterday just by pushing later.
 */
async function applyRow(sql, userId, row) {
  await sql.query(
    `insert into rows
       (user_id, store, id, updated_at, deleted_at, key_id, encryption, payload,
        due_date, due_minutes, time_zone, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (user_id, store, id) do update set
       seq = nextval('rows_seq'),
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       key_id = excluded.key_id,
       encryption = excluded.encryption,
       payload = excluded.payload,
       due_date = excluded.due_date,
       due_minutes = excluded.due_minutes,
       time_zone = excluded.time_zone,
       status = excluded.status
     where rows.updated_at < excluded.updated_at`,
    [
      userId,
      row.store,
      row.id,
      row.updatedAt,
      row.deletedAt,
      row.keyId,
      row.encryption,
      row.payload,
      row.schedule?.dueDate ?? null,
      row.schedule?.dueMinutes ?? null,
      row.schedule?.timeZone ?? null,
      row.schedule?.status ?? null,
    ],
  );
}
async function sync(sql, userId, request) {
  for (const row of request.rows) await applyRow(sql, userId, row);
  const { rows } = await sql.query(
    `select * from rows where user_id = $1 and seq > $2 order by seq limit $3`,
    [userId, request.since, 201],
  );
  const page = rows.slice(0, 200);
  return {
    seq: page.length ? toNumber(page[page.length - 1].seq) : request.since,
    rows: page.map(toSyncRow),
    hasMore: rows.length > 200,
  };
}
/**
 * Media is stored beside the rows rather than in them: a note is a few kilobytes and a
 * scanned lecture is not, and putting one in the other means every sync of a title drags
 * the picture with it.
 */
async function putMedia(sql, userId, meta, bytes) {
  await sql.query(
    `insert into media (user_id, id, mime_type, created, updated_at, key_id, encryption, bytes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, id) do update set
       seq = nextval('rows_seq'),
       mime_type = excluded.mime_type,
       updated_at = excluded.updated_at,
       key_id = excluded.key_id,
       encryption = excluded.encryption,
       bytes = excluded.bytes
     where media.updated_at < excluded.updated_at`,
    [
      userId,
      meta.id,
      meta.mimeType,
      meta.created,
      meta.updatedAt,
      meta.keyId,
      meta.encryption,
      Buffer.from(bytes),
    ],
  );
}
async function getMedia(sql, userId, id) {
  const { rows } = await sql.query("select * from media where user_id = $1 and id = $2", [
    userId,
    id,
  ]);
  const record = rows[0];
  if (!record) return null;
  return {
    meta: {
      id: record.id,
      mimeType: record.mime_type,
      created: toNumber(record.created),
      updatedAt: toNumber(record.updated_at),
      keyId: record.key_id,
      encryption: record.encryption,
    },
    bytes: record.bytes,
  };
}
/** What this account holds, so a device can tell what it is missing without fetching it. */
async function listMedia(sql, userId) {
  const { rows } = await sql.query(
    `select id, mime_type, created, updated_at, key_id, encryption
     from media where user_id = $1 order by id`,
    [userId],
  );
  return rows.map((record) => ({
    id: record.id,
    mimeType: record.mime_type,
    created: toNumber(record.created),
    updatedAt: toNumber(record.updated_at),
    keyId: record.key_id,
    encryption: record.encryption,
  }));
}
//#endregion
//#region server/src/sync-routes.ts
/**
 * Rows in, rows out, and the blobs that are too big to travel with them. Everything here is
 * opaque: the server orders it by `updatedAt` and counts it, and reads none of it.
 */
function syncRoutes({ sql, vapidPublicKey }) {
  const routes = new Hono();
  routes.get("/v1/push/key", () => Response.json({ publicKey: vapidPublicKey ?? null }));
  routes.post("/v1/sync", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = syncRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    return Response.json(await sync(sql, caller.user.id, parsed.data));
  });
  routes.get("/v1/media", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    return Response.json({ media: await listMedia(sql, caller.user.id) });
  });
  routes.put("/v1/media/:id", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const meta = mediaMetaSchema.safeParse({
      id: context.req.param("id"),
      mimeType: context.req.header("x-media-type") ?? "",
      created: Number(context.req.header("x-media-created")),
      updatedAt: Number(context.req.header("x-media-updated")),
      keyId: context.req.header("x-media-key") ?? "",
      encryption: context.req.header("x-media-encryption"),
    });
    if (!meta.success) return fail("invalid_request");
    const bytes = new Uint8Array(await context.req.arrayBuffer());
    if (bytes.byteLength > 26214400) return fail("too_large");
    await putMedia(sql, caller.user.id, meta.data, bytes);
    return noContent();
  });
  routes.get("/v1/media/:id", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const stored = await getMedia(sql, caller.user.id, context.req.param("id"));
    if (!stored) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(stored.bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "x-media-type": stored.meta.mimeType,
        "x-media-created": String(stored.meta.created),
        "x-media-updated": String(stored.meta.updatedAt),
        "x-media-key": stored.meta.keyId,
        "x-media-encryption": stored.meta.encryption,
      },
    });
  });
  routes.post("/v1/push/subscribe", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = pushSubscriptionSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    await saveSubscription(sql, caller.user.id, parsed.data);
    return noContent();
  });
  routes.delete("/v1/push/subscribe", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));
    if (!caller) return fail("unauthorized");
    const parsed = pushSubscriptionSchema
      .pick({ endpoint: true })
      .safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid_request");
    await forgetSubscription(sql, caller.user.id, parsed.data.endpoint);
    return noContent();
  });
  return routes;
}
//#endregion
//#region server/src/app.ts
/**
 * The whole server: CORS, a rate limiter, and three groups of routes over one database.
 *
 * The database is passed in rather than reached for, which is what lets the tests run
 * against real Postgres in-process instead of against a mock of it. The groups are mounted
 * at the root because the paths are already absolute — splitting them was about keeping
 * each file readable, not about giving anything a prefix.
 */
function createApp({ sql, serverSecret, allowedOrigins, limiter, vapidPublicKey }) {
  const deps = {
    sql,
    serverSecret,
    attempts:
      limiter ??
      createRateLimiter({
        limit: 5,
        windowMs: 6e4,
      }),
    vapidPublicKey: vapidPublicKey ?? null,
  };
  const app = new Hono();
  app.use(
    "/v1/*",
    cors({
      origin: allowedOrigins,
      credentials: false,
    }),
  );
  app.route("/", authRoutes(deps));
  app.route("/", syncRoutes(deps));
  app.route("/", sharingRoutes(deps));
  return app;
}
//#endregion
//#region server/src/config.ts
/**
 * The environment, parsed rather than read.
 *
 * Nothing here has a default that would matter if it were wrong. A missing `SERVER_SECRET`
 * is not a reason to invent one: the decoy KDF parameters derive from it, so a secret that
 * changes between restarts makes the decoys inconsistent, and an inconsistent decoy is
 * exactly the tell it exists to avoid.
 */
var configSchema = z.object({
  databaseUrl: z.string().min(1),
  serverSecret: z.string().min(16),
  allowedOrigins: z.array(z.string()),
  port: z.number().int().positive().max(65535),
  /** How often the reminder sweep runs. A minute is finer than any due time is written. */
  sweepEveryMs: z.number().int().positive(),
  /** Absent means this deployment sends no reminders, which is a choice, not a failure. */
  vapid: z
    .object({
      subject: z.string().min(1),
      publicKey: z.string().min(1),
      privateKey: z.string().min(1),
    })
    .nullable(),
});
function numberOr(value, fallback) {
  return value === void 0 || value === "" ? fallback : Number(value);
}
/**
 * VAPID is all three values or none of them. Two out of three is a deployment that believes
 * it sends reminders and does not, which is worse than one that never claimed to.
 */
function vapidFrom(environment) {
  const subject = environment.VAPID_SUBJECT;
  const publicKey = environment.VAPID_PUBLIC_KEY;
  const privateKey = environment.VAPID_PRIVATE_KEY;
  if (!subject && !publicKey && !privateKey) return null;
  return {
    subject: subject ?? "",
    publicKey: publicKey ?? "",
    privateKey: privateKey ?? "",
  };
}
var ConfigError = class extends Error {
  constructor(problems) {
    super(`This server cannot start:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
    this.name = "ConfigError";
  }
};
/**
 * Throws with every problem at once rather than the first, so a first deploy takes one
 * round trip instead of four. The message names the variables and never their values.
 */
function readConfig(environment) {
  const parsed = configSchema.safeParse({
    databaseUrl: environment.DATABASE_URL ?? "",
    serverSecret: environment.SERVER_SECRET ?? "",
    allowedOrigins: (environment.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    port: numberOr(environment.PORT, 8787),
    sweepEveryMs: numberOr(environment.REMINDER_SWEEP_MS, 6e4),
    vapid: vapidFrom(environment),
  });
  if (parsed.success) return parsed.data;
  const named = {
    databaseUrl: "DATABASE_URL is required (a Postgres connection string).",
    serverSecret: "SERVER_SECRET is required, and must be at least 16 characters.",
    port: "PORT must be a port number.",
    sweepEveryMs: "REMINDER_SWEEP_MS must be a positive number of milliseconds.",
    vapid: "VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together.",
  };
  throw new ConfigError([
    ...new Set(
      parsed.error.issues.map(
        (issue) => named[String(issue.path[0])] ?? `${String(issue.path[0])} is not valid.`,
      ),
    ),
  ]);
}
//#endregion
//#region server/src/push.ts
function configurePush(details) {
  webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
}
/**
 * "gone" means the subscription is dead — the browser was uninstalled, or the user cleared
 * their site data — and should be dropped rather than retried. Every other failure is
 * temporary as far as this is concerned: a push service having a bad minute is not a
 * reason to forget where someone's phone is.
 */
async function deliverPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, payload);
    return "sent";
  } catch (error) {
    if (
      error instanceof webpush.WebPushError &&
      (error.statusCode === 404 || error.statusCode === 410)
    )
      return "gone";
    return "sent";
  }
}
//#endregion
//#region server/src/runtime.ts
function startReminderSweep({ sql, deliver, everyMs, onSwept, onError }) {
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      const swept = await sweepReminders(sql, deliver);
      onSwept?.(swept);
    } catch (error) {
      onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void tick(), everyMs);
  };
  timer = setTimeout(() => void tick(), everyMs);
  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
//#endregion
//#region server/src/main.ts
/**
 * The composition root, and the only file here that reaches for the outside world: the
 * environment, a socket, and a real Postgres. Everything it wires together is tested
 * without any of the three, which is why this file is thin enough to read in one go.
 */
async function main() {
  const config = readConfig(process.env);
  const pool = new Pool({ connectionString: config.databaseUrl });
  const sql = { query: (text, values) => pool.query(text, values) };
  await migrate(sql);
  if (config.vapid) configurePush(config.vapid);
  else console.warn("No VAPID keys configured: this server will not send reminders.");
  const sweep = config.vapid
    ? startReminderSweep({
        sql,
        deliver: deliverPush,
        everyMs: config.sweepEveryMs,
        onError: (error) => console.error("A reminder sweep failed.", error),
      })
    : null;
  const app = createApp({
    sql,
    serverSecret: config.serverSecret,
    allowedOrigins: config.allowedOrigins,
    vapidPublicKey: config.vapid?.publicKey ?? null,
  });
  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    ({ port }) => console.info(`Listening on ${port}.`),
  );
  const shutdown = () => {
    sweep?.stop();
    server.close(() => void pool.end());
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
main().catch((error) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
//#endregion
export {};
