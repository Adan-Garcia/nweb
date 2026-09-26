import { z } from "zod";

import { kdfParamsSchema } from "./kdf-params";

/**
 * What an account looks like on the wire.
 *
 * Every field here is something the server is allowed to hold. What it never receives is
 * the passphrase, or anything that can be turned back into one: `authKey` is one half of a
 * derivation whose other half stays on the device, and the sealed blobs are AES-GCM
 * ciphertext under a key the server has no part of.
 *
 * The server's job with all of it is to hand the same bytes back to a device that proves
 * it knows the passphrase. It cannot open them, and does not need to.
 */
const base64 = z.string().min(1);

/** Base64, and long enough that a truncated one is rejected rather than stored. */
const sealed = z.string().min(16);

export const AUTH_KEY_BYTES = 32;

export const registerRequestSchema = z.object({
  email: z.email(),
  /**
   * Proof of the passphrase, and nothing else derivable from it. The server hashes this
   * again before storing it — it is a password as far as the server is concerned, and it
   * must not be usable as one if the database leaks.
   */
  authKey: base64,
  /** So a second device can derive the same thing from the same passphrase. */
  kdf: kdfParamsSchema,
  /** The account key, sealed under a key derived beside `authKey` and never sent. */
  sealedAccountKey: sealed,
  /** This user's public key, which is how anyone shares anything with them. */
  publicKey: base64,
  /** Their private key, sealed under the account key. */
  sealedPrivateKey: sealed,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Before a device can prove a passphrase it has to know what to derive with, and it has
 * only an email to ask by. Answering "no such account" here would turn this into a list of
 * who has one, so the server answers every address: a real account's parameters, or decoys
 * derived from the address and a server secret, which are stable per address and
 * indistinguishable from the real thing.
 */
export const preloginRequestSchema = z.object({
  email: z.email(),
});

export type PreloginRequest = z.infer<typeof preloginRequestSchema>;

export const preloginResponseSchema = z.object({
  kdf: kdfParamsSchema,
});

export type PreloginResponse = z.infer<typeof preloginResponseSchema>;

export const sessionRequestSchema = z.object({
  email: z.email(),
  authKey: base64,
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/**
 * What a device needs before it can ask for the passphrase: the parameters to derive with,
 * and the sealed material to try the result against. Handed out on sign-in, and on the
 * lookup a second device does before it has a session.
 */
export const accountKeyMaterialSchema = z.object({
  kdf: kdfParamsSchema,
  sealedAccountKey: sealed,
  publicKey: base64,
  sealedPrivateKey: sealed,
});

export type AccountKeyMaterial = z.infer<typeof accountKeyMaterialSchema>;

export const sessionResponseSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  /** Opaque to the client; it goes back in the Authorization header and nowhere else. */
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
  keyMaterial: accountKeyMaterialSchema,
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Changing a passphrase re-seals one small blob and re-proves the new one. It does not
 * touch a single note, which is the whole reason the account key is a key of its own
 * rather than something derived from the passphrase directly.
 */
export const changePassphraseRequestSchema = z.object({
  currentAuthKey: base64,
  nextAuthKey: base64,
  kdf: kdfParamsSchema,
  sealedAccountKey: sealed,
});

export type ChangePassphraseRequest = z.infer<typeof changePassphraseRequestSchema>;

/** One shape for every failure, so a client never has to parse prose. */
export const apiErrorSchema = z.object({
  error: z.enum([
    "invalid_request",
    "email_taken",
    "invalid_credentials",
    "unauthorized",
    "too_large",
    "rate_limited",
  ]),
  message: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
