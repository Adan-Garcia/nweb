import { z } from "zod";

/**
 * How a passphrase becomes key material, as it travels.
 *
 * This lives in `shared/` because it is on the wire: a device that has never seen this
 * workspace has to be handed these parameters before it can derive anything, so the server
 * stores them and gives them back at sign-in. It does not know what they are for and could
 * not use them if it did — they are the public half of the derivation, and the passphrase
 * they go with never leaves the device.
 *
 * Deriving from them is `src/lib/crypto/kdf.ts`. Only the shape is shared.
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

/**
 * OWASP's 2023 Argon2id recommendation: 64 MiB, three passes, one lane. The memory is the
 * point — PBKDF2 at any iteration count is cheap to parallelise on a GPU, and 64 MiB per
 * guess is not. It costs about 150ms on a laptop, which is paid once per unlock.
 *
 * Shared because a server that does not know an email has to answer with parameters that
 * look exactly like a real account's, and "exactly" includes the cost.
 */
export const ARGON2ID_DEFAULTS = {
  memorySize: 65_536,
  iterations: 3,
  parallelism: 1,
} as const;

/**
 * The costs an account's key material may be derived at, both ways.
 *
 * The floor is the point. A device signing in derives its proof with whatever parameters
 * the server hands back, and then sends that proof to the server. A server that answered
 * with one PBKDF2 iteration would get back something it could brute-force the passphrase
 * from in an afternoon — and the passphrase also opens the device. Every real account was
 * made with `ARGON2ID_DEFAULTS`, so a floor below them refuses no honest server. The floor
 * is OWASP's minimum for Argon2id, low enough that tuning the defaults will not trip it.
 *
 * The ceiling stops the opposite: parameters that would take a browser tab down.
 */
export const ACCOUNT_KDF_BOUNDS = {
  argon2id: {
    memorySize: { min: 19_456, max: 1_048_576 },
    iterations: { min: 2, max: 10 },
    parallelism: { min: 1, max: 16 },
  },
  pbkdf2: { iterations: { min: 600_000, max: 10_000_000 } },
  saltMaxLength: 128,
} as const;

const { argon2id: ARGON2, pbkdf2: PBKDF2 } = ACCOUNT_KDF_BOUNDS;

/** Sixteen bytes, as `createKdfParams` makes. A salt short enough to repeat can be precomputed. */
export const ACCOUNT_SALT_MIN_BYTES = 16;

/**
 * How many bytes a base64 string decodes to, or -1 when it is not base64. Counted rather
 * than decoded so the one schema works in the browser and on the server alike.
 */
export function base64ByteLength(value: string): number {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return -1;
  }

  return Math.floor((value.replace(/=+$/, "").length * 6) / 8);
}

/**
 * A salt an account may be made with. The server checks it too, so an account it stores is
 * one every device can sign in to: a short salt it accepted would be refused by the client's
 * own floor on the next sign-in, and the account would be unusable.
 */
const accountSalt = z
  .string()
  .max(ACCOUNT_KDF_BOUNDS.saltMaxLength)
  .refine((salt) => base64ByteLength(salt) >= ACCOUNT_SALT_MIN_BYTES, {
    message: "The salt must be base64 of at least 16 bytes",
  });

export const accountKdfSchema = z.discriminatedUnion("name", [
  pbkdf2ParamsSchema.extend({
    iterations: z.number().int().min(PBKDF2.iterations.min).max(PBKDF2.iterations.max),
    salt: accountSalt,
  }),
  argon2idParamsSchema.extend({
    memorySize: z.number().int().min(ARGON2.memorySize.min).max(ARGON2.memorySize.max),
    iterations: z.number().int().min(ARGON2.iterations.min).max(ARGON2.iterations.max),
    parallelism: z.number().int().min(ARGON2.parallelism.min).max(ARGON2.parallelism.max),
    salt: accountSalt,
  }),
]);
