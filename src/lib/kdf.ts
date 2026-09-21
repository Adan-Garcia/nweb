import { argon2id } from "hash-wasm";
import { z } from "zod";

import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * How a passphrase becomes a key.
 *
 * The parameters travel with whatever they protect — a backup envelope, the workspace lock
 * record — rather than living as constants this module happens to hold today. Raising a
 * cost or moving to a different KDF is then a new value in new rows and never a migration:
 * anything written earlier still says how to open itself.
 */
export const pbkdf2ParamsSchema = z.object({
  name: z.literal("PBKDF2"),
  hash: z.literal("SHA-256"),
  iterations: z.number().int().positive(),
  salt: z.string(),
});

export const argon2idParamsSchema = z.object({
  name: z.literal("Argon2id"),
  /** KiB the hash has to fill. Memory is what costs an attacker with GPUs their advantage. */
  memorySize: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  salt: z.string(),
});

export const kdfParamsSchema = z.discriminatedUnion("name", [
  pbkdf2ParamsSchema,
  argon2idParamsSchema,
]);

export type KdfParams = z.infer<typeof kdfParamsSchema>;

/** OWASP's 2023 floor for PBKDF2-HMAC-SHA256. Only read now; nothing new is written with it. */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * OWASP's 2023 Argon2id recommendation: 64 MiB, three passes, one lane. The memory is the
 * point — PBKDF2 at any iteration count is cheap to parallelise on a GPU, and 64 MiB per
 * guess is not. It costs about 150ms on a laptop, which is paid once per unlock.
 */
export const ARGON2ID_DEFAULTS = {
  memorySize: 65_536,
  iterations: 3,
  parallelism: 1,
} as const;

const SALT_BYTES = 16;
const KEY_BITS = 256;

/** What new key material is derived with. Old material keeps whatever it recorded. */
export function createKdfParams(
  salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
): KdfParams {
  return { name: "Argon2id", ...ARGON2ID_DEFAULTS, salt: bytesToBase64(salt) };
}

async function derivePbkdf2(passphrase: string, params: z.infer<typeof pbkdf2ParamsSchema>) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(params.salt),
      iterations: params.iterations,
      hash: params.hash,
    },
    baseKey,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * WebCrypto has no Argon2, so the raw bytes come from WASM and are imported as an AES key
 * afterwards. `hash-wasm` carries its own module inline, so this needs no bundler rule and
 * no fetch at runtime.
 */
async function deriveArgon2id(passphrase: string, params: z.infer<typeof argon2idParamsSchema>) {
  const raw = await argon2id({
    password: passphrase,
    salt: base64ToBytes(params.salt),
    memorySize: params.memorySize,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: KEY_BITS / 8,
    outputType: "binary",
  });

  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  return params.name === "PBKDF2"
    ? derivePbkdf2(passphrase, params)
    : deriveArgon2id(passphrase, params);
}
