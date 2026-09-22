import { accountKeyMaterialSchema } from "@shared/account-contract";
import { keyGraphSchema } from "@shared/sharing-contract";
import { z } from "zod";

import { getNotesDb } from "../notes-db";

/**
 * The account, as this device remembers it.
 *
 * All of it is either public or sealed. The material is what the server already holds — the
 * KDF parameters and two wrapped keys — kept locally so a device that has signed in once can
 * open the workspace with the passphrase alone, with no network. That is the whole point of
 * a local-first app having an account at all: the account is how notes travel, not how they
 * are read.
 *
 * The key graph is cached for the same reason. It is wraps and ids, which are meaningless
 * without a key, and having it means a plane journey still opens every shared course.
 */
export const ACCOUNT_RECORD_ID = "account";

export const accountRecordSchema = z.object({
  id: z.literal(ACCOUNT_RECORD_ID),
  email: z.email(),
  /** Where this account lives, so a device does not have to be told again. */
  baseUrl: z.string().min(1),
  material: accountKeyMaterialSchema,
  /**
   * This workspace's own root key, wrapped under the account key. Everything the workspace
   * writes is sealed under it or under something below it, so one unwrap opens the lot.
   */
  wingKeyId: z.string().min(1),
  wrappedWingKey: z.string().min(1),
  /** The last graph the server handed over. Rebuilt on the next sync; never trusted blindly. */
  graph: keyGraphSchema,
  updatedAt: z.number(),
});

export type AccountRecord = z.infer<typeof accountRecordSchema>;

/**
 * Parsed rather than trusted, like everything else read back from storage. A row this build
 * cannot read is an error and not an absent account: reporting "not signed in" for it would
 * offer to enrol over the top of keys that still protect the notes on disk.
 */
export async function readAccountRecord(): Promise<AccountRecord | null> {
  const database = await getNotesDb();
  const stored = await database.get("account", ACCOUNT_RECORD_ID);

  if (!stored) {
    return null;
  }

  const parsed = accountRecordSchema.safeParse(stored);

  if (!parsed.success) {
    throw new Error("The stored account record is not one this version can read.");
  }

  return parsed.data;
}

export async function writeAccountRecord(
  record: Omit<AccountRecord, "id" | "updatedAt">,
): Promise<AccountRecord> {
  const database = await getNotesDb();
  const next: AccountRecord = { ...record, id: ACCOUNT_RECORD_ID, updatedAt: Date.now() };

  await database.put("account", next);

  return next;
}

/**
 * Forgets the account without touching a note.
 *
 * The rows stay sealed under the wing key, which is only reachable through the account, so
 * this is a door being locked rather than anything being destroyed. Signing back in on this
 * device or another opens it again.
 */
export async function forgetAccountRecord(): Promise<void> {
  const database = await getNotesDb();

  await database.delete("account", ACCOUNT_RECORD_ID);
}
