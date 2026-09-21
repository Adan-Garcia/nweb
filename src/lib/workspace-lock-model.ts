import { z } from "zod";

/**
 * The one row that says a workspace is locked, and how to derive its key.
 *
 * It holds no content. Losing it costs the passphrase — the notes are still there but
 * nothing can derive the key to read them — which is the same as forgetting the
 * passphrase, and is the trade the "no reset" decision already accepted.
 */
export const WORKSPACE_LOCK_ID = "workspace";

/** A known plaintext sealed with the derived key: decrypting it proves the passphrase. */
export const LOCK_VERIFIER_PLAINTEXT = "cuervo-planner-lock-v1";

export const workspaceLockRecordSchema = z.object({
  id: z.literal(WORKSPACE_LOCK_ID),
  kdf: z.object({
    name: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().positive(),
    salt: z.string(),
  }),
  verifier: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type WorkspaceLockRecord = z.infer<typeof workspaceLockRecordSchema>;

/**
 * `unset` — no passphrase has ever been chosen, so nothing is encrypted.
 * `locked` — there is a passphrase and the key is not in memory. Content cannot be read.
 * `unlocked` — the key is in memory and every write from now on is encrypted.
 */
export type WorkspaceLockState = "unset" | "locked" | "unlocked";
