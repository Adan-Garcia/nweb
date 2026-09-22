import { z } from "zod";

/**
 * Which cipher sealed something. Shared because it travels: a row on the wire says how it
 * was sealed so the device that receives it knows whether it has anything to open.
 *
 * The ciphers themselves are `src/lib/cipher.ts`. Only the name is on the wire, and it
 * tells a server nothing it could act on.
 */
export const cipherNameSchema = z.enum(["none", "aes-gcm"]);

export type CipherName = z.infer<typeof cipherNameSchema>;
