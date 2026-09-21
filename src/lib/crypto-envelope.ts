import { z } from "zod";

import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * AES-GCM under a key derived from a passphrase, with everything needed to open it again
 * recorded alongside the ciphertext.
 *
 * The envelope is self-describing on purpose: a backup file has to be openable by a build
 * that has moved on, so the salt and the KDF parameters travel with the data rather than
 * being constants this module happens to hold today.
 *
 * What this protects, and what it does not. It protects a file that leaves the device, and
 * a copied profile directory, against someone who does not have the passphrase. It does
 * not protect against a compromised bundle or an XSS bug: in a browser the key is in JS
 * memory for as long as the data is readable, and the code using it is served from the
 * same origin. Say "encrypted on this device" and nothing stronger.
 */
export const ENCRYPTED_FORMAT = "cuervo-planner-encrypted";

/** OWASP's 2023 floor for PBKDF2-HMAC-SHA256. Recorded per envelope, so it can be raised. */
export const PBKDF2_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;

export const encryptedEnvelopeSchema = z.object({
  format: z.literal(ENCRYPTED_FORMAT),
  version: z.literal(1),
  kdf: z.object({
    name: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().positive(),
    salt: z.string(),
  }),
  cipher: z.literal("AES-GCM"),
  iv: z.string(),
  data: z.string(),
});

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

/**
 * PBKDF2 rather than Argon2id, which would be the stronger choice against an attacker with
 * GPUs. PBKDF2 is what WebCrypto implements natively; Argon2 would mean shipping another
 * WASM blob. The KDF is named in the envelope, so adding Argon2 later is a new `kdf.name`
 * and not a migration.
 */
export async function deriveKeyFromPassphrase({
  passphrase,
  salt,
  iterations,
}: {
  passphrase: string;
  salt: Uint8Array;
  iterations: number;
}): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A fresh salt and IV every time: reusing an IV under one key breaks AES-GCM outright. */
export async function sealWithPassphrase(
  plaintext: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKeyFromPassphrase({ passphrase, salt, iterations });

  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: bytesToBase64(salt) },
    cipher: "AES-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(data)),
  };
}

/**
 * Returns null for the wrong passphrase rather than throwing. GCM authenticates, so a bad
 * key fails the tag check and is indistinguishable from tampering — both mean "cannot open
 * this", which is all a caller can act on.
 */
export async function openWithPassphrase(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<string | null> {
  try {
    const key = await deriveKeyFromPassphrase({
      passphrase,
      salt: base64ToBytes(envelope.kdf.salt),
      iterations: envelope.kdf.iterations,
    });

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.data),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Tells an encrypted file from a plaintext one before anything asks for a passphrase. */
export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return encryptedEnvelopeSchema.safeParse(value).success;
}
