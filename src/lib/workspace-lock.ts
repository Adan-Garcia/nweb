import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  type Cipher,
  createAesGcmCipher,
  getActiveCipher,
  plaintextCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";
import { createKdfParams, deriveKey, type KdfParams } from "./kdf";
import { getNotesDb } from "./notes-db";
import {
  LOCK_VERIFIER_PLAINTEXT,
  WORKSPACE_LOCK_ID,
  type WorkspaceLockRecord,
  workspaceLockRecordSchema,
  type WorkspaceLockState,
} from "./workspace-lock-model";
import { rewriteStoredContent } from "./workspace-rekey";

/**
 * A synchronous hint that a passphrase exists, so the first paint can show the lock screen
 * instead of a blank frame while IndexedDB is read. It is a boolean and nothing else — no
 * key material, no salt — and the record in the database stays the only source of truth,
 * which the async check reconciles against a moment later.
 */
const LOCK_HINT_KEY = "cuervo-workspace-locked";

export function readLockHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(LOCK_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLockHint(isSet: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (isSet) {
      window.localStorage.setItem(LOCK_HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(LOCK_HINT_KEY);
    }
  } catch {
    // A blocked localStorage costs a blank frame on load, not correctness.
  }
}

/**
 * Parsed rather than trusted, like everything else read back from storage. A row that does
 * not describe a KDF this build knows how to run is no key at all, and reporting "no
 * passphrase" for it would quietly write the next note in plaintext beside the locked ones.
 */
async function readLockRecord(): Promise<WorkspaceLockRecord | undefined> {
  const database = await getNotesDb();
  const stored = await database.get("workspace-keys", WORKSPACE_LOCK_ID);

  if (!stored) {
    return undefined;
  }

  const parsed = workspaceLockRecordSchema.safeParse(stored);

  if (!parsed.success) {
    throw new Error("The workspace lock record is not one this version can read.");
  }

  return parsed.data;
}

export async function isWorkspaceLockSet(): Promise<boolean> {
  return Boolean(await readLockRecord());
}

/** What the UI renders from: no passphrase, one that is not in memory, or one that is. */
export async function getWorkspaceLockState(): Promise<WorkspaceLockState> {
  if (!(await isWorkspaceLockSet())) {
    return "unset";
  }

  return getActiveCipher().name === "aes-gcm" ? "unlocked" : "locked";
}

async function cipherFor(passphrase: string, kdf: KdfParams): Promise<Cipher> {
  return createAesGcmCipher(await deriveKey(passphrase, kdf));
}

/** The row that proves a passphrase, written once the content it protects is already sealed. */
async function writeLockRecord(cipher: Cipher, kdf: KdfParams, createdAt: number) {
  const verifier = await cipher.encrypt(new TextEncoder().encode(LOCK_VERIFIER_PLAINTEXT));
  const database = await getNotesDb();

  await database.put("workspace-keys", {
    id: WORKSPACE_LOCK_ID,
    kdf,
    verifier: bytesToBase64(verifier),
    createdAt,
    updatedAt: Date.now(),
  });
}

/**
 * Chooses the passphrase and encrypts what is already stored.
 *
 * The rewrite is the part that matters: without it, turning the lock on would leave every
 * note written so far sitting in plaintext behind a screen that merely refuses to show it.
 * The lock record is written last, so a failure partway through leaves the workspace
 * unlocked and readable rather than half-sealed with no way in.
 */
export async function createWorkspaceLock(passphrase: string): Promise<void> {
  if (await isWorkspaceLockSet()) {
    throw new Error("This workspace already has a passphrase.");
  }

  const kdf = createKdfParams();
  const cipher = await cipherFor(passphrase, kdf);

  await rewriteStoredContent({ from: plaintextCipher, to: cipher });
  await writeLockRecord(cipher, kdf, Date.now());

  writeLockHint(true);
  setActiveCipher(cipher);
}

/**
 * Moves the workspace from one passphrase to another in a single pass.
 *
 * Remove-then-set would do it in two, and would leave every note in plaintext on disk in
 * between — a window where a crash, or anyone reading the profile directory, gets the lot.
 * Rewriting straight from the old cipher to the new one never writes a readable row. The
 * new record is written last, so a failure partway leaves the old passphrase the one that
 * opens whatever has not been converted yet.
 */
export async function changeWorkspacePassphrase(
  currentPassphrase: string,
  nextPassphrase: string,
): Promise<boolean> {
  const record = await readLockRecord();

  if (!record || !(await unlockWorkspace(currentPassphrase))) {
    return false;
  }

  const kdf = createKdfParams();
  const next = await cipherFor(nextPassphrase, kdf);

  await rewriteStoredContent({ from: getActiveCipher(), to: next });
  await writeLockRecord(next, kdf, record.createdAt);

  setActiveCipher(next);
  return true;
}

/**
 * Puts the key in memory if the passphrase is right. False means wrong passphrase: the
 * verifier is authenticated, so a bad key fails its tag check rather than producing
 * plausible rubbish.
 */
export async function unlockWorkspace(passphrase: string): Promise<boolean> {
  const record = await readLockRecord();

  if (!record) {
    return false;
  }

  // The derivation is inside the try as well: a passphrase a KDF will not even accept —
  // an empty one, which Argon2id rejects outright — is a wrong passphrase like any other,
  // and the caller has nothing different to do about it.
  try {
    const cipher = await cipherFor(passphrase, record.kdf);
    const opened = await cipher.decrypt(base64ToBytes(record.verifier));

    if (new TextDecoder().decode(opened) !== LOCK_VERIFIER_PLAINTEXT) {
      return false;
    }

    setActiveCipher(cipher);
    return true;
  } catch {
    return false;
  }
}

/** Drops the key. The content stays encrypted and unreadable until the next unlock. */
export function lockWorkspace() {
  resetActiveCipher();
}

/**
 * Removes the passphrase and writes everything back as plaintext, so a user who no longer
 * wants the lock is not trapped behind it. The record is deleted last, for the same reason
 * it is written last when the lock goes on.
 */
export async function removeWorkspaceLock(passphrase: string): Promise<boolean> {
  const record = await readLockRecord();

  if (!record || !(await unlockWorkspace(passphrase))) {
    return false;
  }

  await rewriteStoredContent({ from: getActiveCipher(), to: plaintextCipher });

  const database = await getNotesDb();
  await database.delete("workspace-keys", WORKSPACE_LOCK_ID);

  writeLockHint(false);
  resetActiveCipher();
  return true;
}
