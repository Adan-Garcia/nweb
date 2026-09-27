import type { Cipher } from "../crypto/cipher";
import { createKeyId } from "../crypto/cipher";
import { createKdfParams } from "../crypto/kdf";
import { getNotesDb } from "../db/notes-db";
import { readRekeyJournal } from "./rekey-journal";
import {
  cipherFor,
  opensVerifier,
  readLockRecord,
  verifierFor,
  writeLockHint,
} from "./workspace-lock";
import { WORKSPACE_LOCK_ID } from "./workspace-lock-model";

/**
 * The lock record on its own, apart from the rows it protects: checking a passphrase
 * against it, and pointing it at a new one. Neither rewrites a row, which is what makes
 * them safe on a device on a server account, whose rows are under the account's keys.
 */
/**
 * Points the lock at a passphrase without rewriting a single row, and returns its cipher.
 *
 * Only for a workspace whose rows are not under the lock's own key — one on a server
 * account, where every row is sealed under the account's keys and the lock record is just
 * the device's proof of the passphrase. Used when the account passphrase changes, when a
 * device signs in with one, and when an older device that joined an account without a lock
 * sets up its local account. Calling it over rows the old lock key sealed would strand them.
 */
export async function resetLockRecord(passphrase: string): Promise<Cipher> {
  if (await readRekeyJournal()) {
    throw new Error("A passphrase change was interrupted and has to be finished first.");
  }

  const kdf = createKdfParams();
  const keyId = createKeyId();
  const cipher = await cipherFor(passphrase, kdf, keyId);
  const existing = await readLockRecord();
  const database = await getNotesDb();

  await database.put("workspace-keys", {
    id: WORKSPACE_LOCK_ID,
    kdf,
    keyId,
    verifier: await verifierFor(cipher),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  writeLockHint(true);

  return cipher;
}

/**
 * The lock's cipher for this passphrase, when it is the right one; null when it is not.
 * Puts nothing in memory, so it can check a passphrase without unlocking anything.
 */
export async function lockCipherFor(passphrase: string): Promise<Cipher | null> {
  const record = await readLockRecord();

  if (!record) {
    return null;
  }

  try {
    const cipher = await cipherFor(passphrase, record.kdf, record.keyId ?? "");

    return (await opensVerifier(cipher, record.verifier)) ? cipher : null;
  } catch {
    return null;
  }
}
