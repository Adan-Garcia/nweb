import { z } from "zod";

/**
 * The seam between "bytes the app produced" and "bytes that go into IndexedDB".
 *
 * Storage modules ask for the active cipher and run their payload through it; they never
 * know whether anything happened. Before a passphrase exists the active cipher is the
 * plaintext one, so nothing does; unlocking swaps in an AES-GCM cipher and every write
 * from that moment is encrypted — without a single storage module changing.
 *
 * Each row records which cipher wrote it (`NotesDocumentRecord.encryption`, and
 * `encryption` on every named row — see `sealed-text.ts`), so a database can hold a mix
 * and still be readable. That is what makes turning this on a decision the user takes
 * rather than a migration that has to rewrite everything at once.
 */
export const cipherNameSchema = z.enum(["none", "aes-gcm"]);

export type CipherName = z.infer<typeof cipherNameSchema>;

export type Cipher = {
  readonly name: CipherName;
  encrypt: (bytes: Uint8Array) => Promise<Uint8Array>;
  decrypt: (bytes: Uint8Array) => Promise<Uint8Array>;
};

const IV_BYTES = 12;

/** Does nothing, and says so. The default until a passphrase exists. */
export const plaintextCipher: Cipher = {
  name: "none",
  encrypt: (bytes) => Promise.resolve(bytes),
  decrypt: (bytes) => Promise.resolve(bytes),
};

/**
 * The IV is prefixed to the ciphertext rather than stored beside it, so one `Uint8Array`
 * is still the whole payload and no row shape has to grow a column for it.
 */
export function createAesGcmCipher(key: CryptoKey): Cipher {
  return {
    name: "aes-gcm",
    async encrypt(bytes) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new Uint8Array(bytes),
      );

      const payload = new Uint8Array(IV_BYTES + sealed.byteLength);
      payload.set(iv, 0);
      payload.set(new Uint8Array(sealed), IV_BYTES);

      return payload;
    },
    async decrypt(bytes) {
      const payload = Uint8Array.from(bytes);
      const opened = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: payload.subarray(0, IV_BYTES) },
        key,
        payload.subarray(IV_BYTES),
      );

      return new Uint8Array(opened);
    },
  };
}

let activeCipher: Cipher = plaintextCipher;

export function getActiveCipher(): Cipher {
  return activeCipher;
}

/** Called by the unlock step once a key has been derived. */
export function setActiveCipher(cipher: Cipher) {
  activeCipher = cipher;
}

/** Drops the key from memory. Anything written while locked would be plaintext. */
export function resetActiveCipher() {
  activeCipher = plaintextCipher;
}

/**
 * Whether a failure is only "the workspace is locked".
 *
 * A page calls its data hook before it renders the shell, and the shell is what decides to
 * show the lock screen instead of the page — so the load starts either way and finds rows
 * it has no key for. That is nothing to load, not a fault: the user is looking at the lock
 * screen. Anything else still throws.
 */
export function isLockedError(error: unknown): boolean {
  return error instanceof CipherUnavailableError;
}

export class CipherUnavailableError extends Error {
  constructor(wroteWith: CipherName) {
    super(`This note was written with the ${wroteWith} cipher, which is not unlocked.`);
    this.name = "CipherUnavailableError";
  }
}

/**
 * Reads a payload back with whatever wrote it. A row written by a cipher that is not
 * active now cannot be read, and that has to be an error rather than a shrug: returning
 * the raw bytes would hand the editor ciphertext and autosave would then write it back as
 * if it were the note.
 */
export async function decryptWith(
  bytes: Uint8Array,
  wroteWith: CipherName,
  cipher: Cipher = getActiveCipher(),
): Promise<Uint8Array> {
  if (wroteWith === "none") {
    return bytes;
  }

  if (cipher.name !== wroteWith) {
    throw new CipherUnavailableError(wroteWith);
  }

  return cipher.decrypt(bytes);
}
