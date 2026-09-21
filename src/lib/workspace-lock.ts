import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  type Cipher,
  createAesGcmCipher,
  getActiveCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";
import { deriveKey, type KdfParams } from "./kdf";
import { getNotesDb } from "./notes-db";
import { readRekeyJournal } from "./rekey-journal";
import {
  LOCK_VERIFIER_PLAINTEXT,
  WORKSPACE_LOCK_ID,
  type WorkspaceLockRecord,
  workspaceLockRecordSchema,
  type WorkspaceLockState,
} from "./workspace-lock-model";

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

export function writeLockHint(isSet: boolean) {
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
export async function readLockRecord(): Promise<WorkspaceLockRecord | undefined> {
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

/**
 * What the UI renders from: a rekey that never finished, no passphrase, one that is not in
 * memory, or one that is.
 *
 * The interrupted case is checked first and on purpose. A half-converted workspace has
 * rows under two different keys, and letting it through as "unset" or "unlocked" would put
 * the app in front of rows it cannot open and invite it to write more beside them.
 */
export async function getWorkspaceLockState(): Promise<WorkspaceLockState> {
  if (await readRekeyJournal()) {
    return "interrupted";
  }

  if (!(await isWorkspaceLockSet())) {
    return "unset";
  }

  return getActiveCipher().name === "aes-gcm" ? "unlocked" : "locked";
}

export async function cipherFor(passphrase: string, kdf: KdfParams): Promise<Cipher> {
  return createAesGcmCipher(await deriveKey(passphrase, kdf));
}

/**
 * A known plaintext sealed with a key: decrypting it later proves the passphrase. It is
 * produced before any content is rewritten, because the rekey journal has to carry it —
 * a passphrase whose verifier was never written down is one nothing can check.
 */
export async function verifierFor(cipher: Cipher): Promise<string> {
  return bytesToBase64(await cipher.encrypt(new TextEncoder().encode(LOCK_VERIFIER_PLAINTEXT)));
}

/** True when this cipher is the one that sealed the verifier. */
export async function opensVerifier(cipher: Cipher, verifier: string): Promise<boolean> {
  try {
    const opened = await cipher.decrypt(base64ToBytes(verifier));

    return new TextDecoder().decode(opened) === LOCK_VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
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

    if (!(await opensVerifier(cipher, record.verifier))) {
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
