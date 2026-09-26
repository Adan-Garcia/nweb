import { ARGON2ID_DEFAULTS, type KdfParams } from "@shared/kdf-params";
import { argon2id } from "hash-wasm";

import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * Turning a passphrase into key material. The parameters this reads travel with whatever
 * they protect and are defined in `@shared/kdf-params`, because a server hands them back
 * to a device that has never seen this workspace.
 */

const SALT_BYTES = 16;
const KEY_BITS = 256;

/** What new key material is derived with. Old material keeps whatever it recorded. */
export function createKdfParams(
  salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
): KdfParams {
  return { name: "Argon2id", ...ARGON2ID_DEFAULTS, salt: bytesToBase64(salt) };
}

async function derivePbkdf2Bits(
  passphrase: string,
  params: Extract<KdfParams, { name: "PBKDF2" }>,
) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64ToBytes(params.salt),
      iterations: params.iterations,
      hash: params.hash,
    },
    baseKey,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

/**
 * WebCrypto has no Argon2, so the bytes come from WASM. `hash-wasm` carries its own module
 * inline, so this needs no bundler rule and no fetch at runtime.
 */
async function deriveArgon2idBits(
  passphrase: string,
  params: Extract<KdfParams, { name: "Argon2id" }>,
) {
  const raw = await argon2id({
    password: passphrase,
    salt: base64ToBytes(params.salt),
    memorySize: params.memorySize,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: KEY_BITS / 8,
    outputType: "binary",
  });

  return new Uint8Array(raw);
}

/**
 * The KDF's raw output, before it is turned into a key for anything in particular.
 *
 * An account needs this rather than a finished key: one passphrase has to yield both the
 * proof it sends to a server and the key that unwraps its content, and those have to be
 * derived from the same bytes without either one revealing the other (`account-keys.ts`).
 * A workspace lock with no account goes straight to `deriveKey` and never sees them.
 */
export function deriveMasterBits(
  passphrase: string,
  params: KdfParams,
): Promise<Uint8Array<ArrayBuffer>> {
  return params.name === "PBKDF2"
    ? derivePbkdf2Bits(passphrase, params)
    : deriveArgon2idBits(passphrase, params);
}

/**
 * The same bytes as an AES-GCM key. Imported non-extractable, so nothing downstream can
 * read them back out — which is why this and `deriveMasterBits` are separate calls rather
 * than one returning both.
 */
export async function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    await deriveMasterBits(passphrase, params),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
