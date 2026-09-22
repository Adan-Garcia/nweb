import { kdfParamsSchema } from "@shared/kdf-params";
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
  /**
   * The same self-describing parameters a backup envelope carries. A workspace locked
   * before Argon2id shipped still records PBKDF2 and still opens with it; the two are told
   * apart by `name`, and nothing has to be rewritten for a lock to move between them.
   */
  kdf: kdfParamsSchema,
  /**
   * The id of the key this passphrase derives, stamped on every row it seals. Absent on a
   * lock set before keys had ids, whose rows carry none either.
   */
  keyId: z.string().optional(),
  verifier: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type WorkspaceLockRecord = z.infer<typeof workspaceLockRecordSchema>;

/**
 * `unset` — no passphrase has ever been chosen, so nothing is encrypted.
 * `locked` — there is a passphrase and the key is not in memory. Content cannot be read.
 * `unlocked` — the key is in memory and every write from now on is encrypted.
 * `interrupted` — a rekey started and did not finish, so rows sit under two keys. Nothing
 * may be read or written until it is finished; the journal says what it needs.
 */
export type WorkspaceLockState = "unset" | "locked" | "unlocked" | "interrupted";
