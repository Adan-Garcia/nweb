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
 * Deriving from them is `src/lib/kdf.ts`. Only the shape is shared.
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
