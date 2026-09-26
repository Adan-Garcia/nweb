import { hash, verify } from "@node-rs/argon2";
import type {
  AccountKeyMaterial,
  ChangePassphraseRequest,
  RegisterRequest,
  SessionRequest,
} from "@shared/account-contract";
import { ARGON2ID_DEFAULTS, type KdfParams } from "@shared/kdf-params";
import { createHmac } from "node:crypto";

import { normalizeEmail, type Sql } from "./db";
import { hashToken, issueToken, SESSION_TTL_MS } from "./tokens";

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
/*
 * The algorithm is left at the library's default, which is Argon2id — naming it would mean
 * importing an ambient const enum, which `verbatimModuleSyntax` does not allow. A test
 * asserts the produced hash says `argon2id`, so the default is pinned by something that
 * fails rather than by a line in someone else's type definitions.
 */
const ARGON2_SERVER = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type UserRow = {
  id: string;
  email: string;
  auth_hash: string;
  kdf: KdfParams;
  sealed_account_key: string;
  public_key: string;
  sealed_private_key: string;
};

function materialFrom(row: UserRow): AccountKeyMaterial {
  return {
    kdf: row.kdf,
    sealedAccountKey: row.sealed_account_key,
    publicKey: row.public_key,
    sealedPrivateKey: row.sealed_private_key,
  };
}

async function findByEmail(sql: Sql, email: string): Promise<UserRow | null> {
  const { rows } = await sql.query<UserRow>("select * from users where email = $1", [
    normalizeEmail(email),
  ]);

  return rows[0] ?? null;
}

/**
 * Parameters for an address the server has never seen, derived from the address and a
 * secret so they are the same every time it is asked. A random salt per request would be
 * a tell: two probes for one address would disagree, and a real account's would not.
 */
export function decoyKdf(email: string, serverSecret: string): KdfParams {
  const salt = createHmac("sha256", serverSecret)
    .update(`kdf-decoy:${normalizeEmail(email)}`)
    .digest()
    .subarray(0, 16)
    .toString("base64");

  return { name: "Argon2id", ...ARGON2ID_DEFAULTS, salt };
}

export async function prelogin(
  sql: Sql,
  email: string,
  serverSecret: string,
): Promise<{ kdf: KdfParams }> {
  const user = await findByEmail(sql, email);

  return { kdf: user ? user.kdf : decoyKdf(email, serverSecret) };
}

export type RegisterOutcome = { userId: string } | { error: "email_taken" };

export async function register(sql: Sql, request: RegisterRequest): Promise<RegisterOutcome> {
  const email = normalizeEmail(request.email);

  if (await findByEmail(sql, email)) {
    return { error: "email_taken" };
  }

  const authHash = await hash(request.authKey, ARGON2_SERVER);

  const { rows } = await sql.query<{ id: string }>(
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

  // The unique index is what actually decides it: two registrations for one address can
  // both pass the check above and only one can insert.
  return rows[0] ? { userId: rows[0].id } : { error: "email_taken" };
}

export type Session = {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
  keyMaterial: AccountKeyMaterial;
};

/**
 * Null covers both an address with no account and the wrong proof for one that exists.
 * Telling them apart is a list of who has an account, and the caller has nothing different
 * to do about either.
 */
export async function createSession(
  sql: Sql,
  request: SessionRequest,
  now = Date.now(),
): Promise<Session | null> {
  const user = await findByEmail(sql, request.email);

  if (!user || !(await verifyAuthKey(request.authKey, user.auth_hash))) {
    return null;
  }

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
async function verifyAuthKey(authKey: string, authHash: string): Promise<boolean> {
  try {
    return await verify(authHash, authKey);
  } catch {
    return false;
  }
}

export async function userForToken(
  sql: Sql,
  token: string,
  now = Date.now(),
): Promise<UserRow | null> {
  const { rows } = await sql.query<UserRow>(
    `select users.* from sessions
     join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > $2`,
    [hashToken(token), new Date(now).toISOString()],
  );

  return rows[0] ?? null;
}

export async function endSession(sql: Sql, token: string): Promise<void> {
  await sql.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}

export function keyMaterialFor(user: UserRow): AccountKeyMaterial {
  return materialFrom(user);
}

/**
 * A new passphrase over the same account. The account key is unchanged — only the wrapping
 * of it is — so nothing this user has stored is touched, whatever there is of it.
 *
 * Every other session is dropped. A passphrase is usually changed because the old one is
 * suspect, and leaving the sessions it opened alive would make the change decorative.
 */
export async function changePassphrase(
  sql: Sql,
  user: UserRow,
  request: ChangePassphraseRequest,
  keepToken: string,
): Promise<boolean> {
  if (!(await verifyAuthKey(request.currentAuthKey, user.auth_hash))) {
    return false;
  }

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
