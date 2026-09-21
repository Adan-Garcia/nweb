import { z } from "zod";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { createKdfParams, deriveKey, type KdfParams, kdfParamsSchema } from "./kdf";

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

const IV_BYTES = 12;

export const encryptedEnvelopeSchema = z.object({
  format: z.literal(ENCRYPTED_FORMAT),
  /**
   * Still 1 with Argon2id. The reader is driven by `kdf.name`, which was the point of
   * naming it in the file: a new KDF is a new value in a field that already exists, so
   * the shape of the envelope has not changed and neither has what opens it.
   */
  version: z.literal(1),
  kdf: kdfParamsSchema,
  cipher: z.literal("AES-GCM"),
  iv: z.string(),
  data: z.string(),
});

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

/** A fresh salt and IV every time: reusing an IV under one key breaks AES-GCM outright. */
export async function sealWithPassphrase(
  plaintext: string,
  passphrase: string,
  kdf: KdfParams = createKdfParams(),
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, kdf);

  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf,
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
    const key = await deriveKey(passphrase, envelope.kdf);

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
