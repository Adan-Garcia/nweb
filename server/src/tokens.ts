import { createHash, randomBytes } from "node:crypto";

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
const TOKEN_BYTES = 32;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function issueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The bearer token from an Authorization header, or null if there is not one. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) {
    return null;
  }

  const [scheme, value] = header.split(" ");

  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}
