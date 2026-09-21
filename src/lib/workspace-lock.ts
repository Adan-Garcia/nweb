import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  type Cipher,
  createAesGcmCipher,
  getActiveCipher,
  plaintextCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";
import { deriveKeyFromPassphrase, PBKDF2_ITERATIONS } from "./crypto-envelope";
import { getNotesDb } from "./notes-db";
import {
  LOCK_VERIFIER_PLAINTEXT,
  WORKSPACE_LOCK_ID,
  type WorkspaceLockRecord,
  type WorkspaceLockState,
} from "./workspace-lock-model";
import { rewriteStoredContent } from "./workspace-rekey";

const SALT_BYTES = 16;

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

async function readLockRecord(): Promise<WorkspaceLockRecord | undefined> {
  const database = await getNotesDb();

  return database.get("workspace-keys", WORKSPACE_LOCK_ID);
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

async function cipherFor(passphrase: string, record: WorkspaceLockRecord): Promise<Cipher> {
  const key = await deriveKeyFromPassphrase({
    passphrase,
    salt: base64ToBytes(record.kdf.salt),
    iterations: record.kdf.iterations,
  });

  return createAesGcmCipher(key);
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

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKeyFromPassphrase({
    passphrase,
    salt,
    iterations: PBKDF2_ITERATIONS,
  });
  const cipher = createAesGcmCipher(key);

  await rewriteStoredContent({ from: plaintextCipher, to: cipher });

  const verifier = await cipher.encrypt(new TextEncoder().encode(LOCK_VERIFIER_PLAINTEXT));
  const now = Date.now();
  const database = await getNotesDb();

  await database.put("workspace-keys", {
    id: WORKSPACE_LOCK_ID,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    verifier: bytesToBase64(verifier),
    createdAt: now,
    updatedAt: now,
  });

  writeLockHint(true);
  setActiveCipher(cipher);
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

  const cipher = await cipherFor(passphrase, record);

  try {
    const opened = await cipher.decrypt(base64ToBytes(record.verifier));

    if (new TextDecoder().decode(opened) !== LOCK_VERIFIER_PLAINTEXT) {
      return false;
    }
  } catch {
    return false;
  }

  setActiveCipher(cipher);
  return true;
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
