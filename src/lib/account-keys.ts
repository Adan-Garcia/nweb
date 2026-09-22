import type { AccountKeyMaterial } from "@shared/account-contract";
import type { KdfParams } from "@shared/kdf-params";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { createKdfParams, deriveMasterBits } from "./kdf";

/**
 * The keys an account is made of, and the one place a passphrase turns into them.
 *
 * ```
 * passphrase --Argon2id--> master bytes
 *                           |--HKDF "auth"--> authKey        the server gets this
 *                           '--HKDF "wrap"--> wrapKey        never leaves the device
 *                                                |
 *                                                unwraps accountKey (random, 256-bit)
 *                                                            |
 *                                                            unwraps the private key,
 *                                                            and later every object key
 * ```
 *
 * Two things fall out of that shape, and both are the point of it:
 *
 * **The server cannot derive anything.** `authKey` and `wrapKey` come from the same bytes
 * through HKDF with different labels, which is a one-way expansion: holding one says
 * nothing about the other. The server stores a hash of `authKey` and a pile of ciphertext.
 *
 * **Changing a passphrase is O(1).** The content is under `accountKey`, which is random and
 * never changes; a new passphrase re-wraps that one small key and touches no note. The
 * alternative — deriving the content key from the passphrase — is what makes a passphrase
 * change a rewrite of the whole workspace, which is the cost `workspace-rekey.ts` exists to
 * survive and which this design does not pay.
 */
const AUTH_INFO = "cuervo/account/auth/v1";
const WRAP_INFO = "cuervo/account/wrap/v1";

const IV_BYTES = 12;
const EXPANDED_BITS = 256;

/** RSA-OAEP, so sharing a key with someone is one call against their public key. */
const IDENTITY_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} as const;

export type AccountKeys = {
  /** Wraps everything this account can read. Extractable, because it has to be re-wrapped. */
  accountKey: CryptoKey;
  /** This account's identity key. Others encrypt to its public half to share with it. */
  privateKey: CryptoKey;
  publicKey: string;
};

/** What the server is handed, and what it can hand back to a device that proves itself. */
export type AccountEnrolment = {
  authKey: string;
  material: AccountKeyMaterial;
};

/**
 * HKDF over the KDF's output. The salt is empty on purpose: HKDF's extract step exists to
 * condition input that is not uniform, and Argon2id's output already is. The label is what
 * separates the two keys, and it is versioned so a third one can be added without either
 * of these changing.
 */
async function expand(master: Uint8Array<ArrayBuffer>, info: string) {
  const base = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);

  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    base,
    EXPANDED_BITS,
  );

  return new Uint8Array(bits);
}

/** The two halves of a passphrase: one to prove it, one to open what it protects. */
async function splitPassphrase(passphrase: string, kdf: KdfParams) {
  const master = await deriveMasterBits(passphrase, kdf);

  return {
    authKey: bytesToBase64(await expand(master, AUTH_INFO)),
    wrapKey: await crypto.subtle.importKey(
      "raw",
      await expand(master, WRAP_INFO),
      "AES-GCM",
      false,
      ["wrapKey", "unwrapKey"],
    ),
  };
}

/** The IV goes in front of the wrapped bytes, as it does everywhere else here. */
async function wrap(format: "raw" | "pkcs8", key: CryptoKey, wrappingKey: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey(format, key, wrappingKey, { name: "AES-GCM", iv }),
  );

  const payload = new Uint8Array(IV_BYTES + wrapped.byteLength);
  payload.set(iv, 0);
  payload.set(wrapped, IV_BYTES);

  return bytesToBase64(payload);
}

async function unwrap(
  format: "raw" | "pkcs8",
  sealed: string,
  wrappingKey: CryptoKey,
  algorithm: AesKeyAlgorithm | RsaHashedImportParams,
  usages: KeyUsage[],
) {
  const payload = base64ToBytes(sealed);

  return crypto.subtle.unwrapKey(
    format,
    payload.subarray(IV_BYTES),
    wrappingKey,
    { name: "AES-GCM", iv: payload.subarray(0, IV_BYTES) },
    algorithm,
    true,
    usages,
  );
}

/** Proof of a passphrase, for a device that already knows the parameters to derive with. */
export async function deriveAuthKey(passphrase: string, kdf: KdfParams): Promise<string> {
  return (await splitPassphrase(passphrase, kdf)).authKey;
}

/**
 * Everything a new account is: a random key for its content, an identity keypair, and both
 * sealed under a passphrase that the server never learns.
 */
export async function createAccountKeys(
  passphrase: string,
): Promise<{ keys: AccountKeys; enrolment: AccountEnrolment }> {
  const kdf = createKdfParams();
  const { authKey, wrapKey } = await splitPassphrase(passphrase, kdf);

  const accountKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "wrapKey",
    "unwrapKey",
  ]);
  // `wrapKey`/`unwrapKey` as well as `encrypt`/`decrypt`: a grant is a key sealed under
  // this pair, and `openKeyGraph` unwraps it as a key rather than decrypting it as bytes.
  // Without the usage the unwrap throws, and nothing anyone shares would ever open.
  const identity = await crypto.subtle.generateKey(IDENTITY_ALGORITHM, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);

  const publicKey = bytesToBase64(
    new Uint8Array(await crypto.subtle.exportKey("spki", identity.publicKey)),
  );

  return {
    keys: { accountKey, privateKey: identity.privateKey, publicKey },
    enrolment: {
      authKey,
      material: {
        kdf,
        sealedAccountKey: await wrap("raw", accountKey, wrapKey),
        publicKey,
        sealedPrivateKey: await wrap("pkcs8", identity.privateKey, accountKey),
      },
    },
  };
}

/**
 * Opens an account on a device that has only the passphrase and what the server holds.
 *
 * Null is the wrong passphrase. AES-GCM authenticates, so a bad key fails the tag check
 * rather than producing a key that would go on to decrypt nothing but rubbish.
 */
export async function openAccountKeys(
  passphrase: string,
  material: AccountKeyMaterial,
): Promise<AccountKeys | null> {
  try {
    const { wrapKey } = await splitPassphrase(passphrase, material.kdf);
    const accountKey = await unwrap(
      "raw",
      material.sealedAccountKey,
      wrapKey,
      { name: "AES-GCM", length: 256 },
      ["wrapKey", "unwrapKey"],
    );
    const privateKey = await unwrap(
      "pkcs8",
      material.sealedPrivateKey,
      accountKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      ["decrypt", "unwrapKey"],
    );

    return { accountKey, privateKey, publicKey: material.publicKey };
  } catch {
    return null;
  }
}

/**
 * Moves an account to a new passphrase. The account key is not regenerated, so nothing it
 * protects is touched — this is one wrap and a new proof, whatever the workspace holds.
 */
export async function resealAccountKeys(
  keys: AccountKeys,
  material: AccountKeyMaterial,
  nextPassphrase: string,
): Promise<AccountEnrolment> {
  const kdf = createKdfParams();
  const { authKey, wrapKey } = await splitPassphrase(nextPassphrase, kdf);

  return {
    authKey,
    material: {
      ...material,
      kdf,
      sealedAccountKey: await wrap("raw", keys.accountKey, wrapKey),
    },
  };
}
