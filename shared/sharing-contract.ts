import { z } from "zod";

/**
 * Sharing, which here is entirely a question of who can derive which key.
 *
 * Sharing has to work at any level — a wing, a term, a course, a tag, or one note handed
 * to one person — and a nest is a tag, so what contains what is a graph and not a tree. The
 * model that survives that is envelope encryption over the graph:
 *
 *   - every leaf (a note, a task, a file) has a data key of its own;
 *   - every container (a wing, flight, branch, nest) has a key that encrypts no content and
 *     exists only to wrap the keys beneath it;
 *   - an edge is a wrapped key: the child's, sealed under the parent's;
 *   - a share is one more wrap, this time under the recipient's public key.
 *
 * To read one thing a client walks: its own private key, the grants it holds, down the
 * wraps, to the key it needs. The server holds every one of those wraps and can open none
 * of them.
 */
export const KEY_KINDS = ["wing", "flight", "branch", "nest", "feather", "twig", "pebble"] as const;

export type KeyKind = (typeof KEY_KINDS)[number];

/** What a share lets someone do. Reading is the hard part; writing is a server check. */
export const SHARE_ROLES = ["reader", "writer"] as const;

export type ShareRole = (typeof SHARE_ROLES)[number];

export const keyRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(KEY_KINDS),
  /** Set when this key replaced another, so a rotation leaves a trail rather than a gap. */
  rotatedFrom: z.string().nullable(),
  /**
   * When the server first recorded this key, in milliseconds. What a scheduled rotation
   * measures age by. The server's clock and not the client's, and ignored when a client
   * sends it; absent on a key the server has not been told about yet.
   */
  createdAt: z.number().int().nonnegative().optional(),
});

export type KeyRecord = z.infer<typeof keyRecordSchema>;

/** A child key sealed under its parent's. The bytes are meaningless without the parent. */
export const keyWrapSchema = z.object({
  parentKeyId: z.string().min(1),
  childKeyId: z.string().min(1),
  wrapped: z.string().min(1),
});

export type KeyWrap = z.infer<typeof keyWrapSchema>;

/** A key sealed under someone's public key: the one edge that crosses between people. */
export const grantSchema = z.object({
  keyId: z.string().min(1),
  role: z.enum(SHARE_ROLES),
  wrapped: z.string().min(1),
});

export type Grant = z.infer<typeof grantSchema>;

/**
 * Everything this user can walk from. The server returns the whole graph rather than
 * answering "can I read X" one key at a time, because the walk is the client's to do and
 * because the shape is not what is being protected.
 */
export const keyGraphSchema = z.object({
  keys: z.array(keyRecordSchema),
  wraps: z.array(keyWrapSchema),
  grants: z.array(grantSchema),
});

export type KeyGraph = z.infer<typeof keyGraphSchema>;

/**
 * Creating keys and edges. A client sends what it has just generated; the server stores
 * bytes it cannot read and enforces only that they belong to someone who already had the
 * key being wrapped.
 */
export const putKeysRequestSchema = z.object({
  keys: z.array(keyRecordSchema).max(200),
  wraps: z.array(keyWrapSchema).max(500),
  /** Grants for this user themselves — how a key they just made becomes reachable. */
  grants: z.array(grantSchema).max(200),
});

export type PutKeysRequest = z.infer<typeof putKeysRequestSchema>;

export const shareRequestSchema = z.object({
  keyId: z.string().min(1),
  /** Who it is for. The wrap was made against the public key this address published. */
  email: z.email(),
  role: z.enum(SHARE_ROLES),
  wrapped: z.string().min(1),
});

export type ShareRequest = z.infer<typeof shareRequestSchema>;

export const revokeRequestSchema = z.object({
  keyId: z.string().min(1),
  email: z.email(),
});

export type RevokeRequest = z.infer<typeof revokeRequestSchema>;

/** What you need before you can share with someone: the key you seal for them. */
export const publicKeyResponseSchema = z.object({
  email: z.email(),
  publicKey: z.string().min(1),
});

export type PublicKeyResponse = z.infer<typeof publicKeyResponseSchema>;

/** Who can see a thing, for the screen that shows it. Addresses, never keys. */
export const shareListSchema = z.object({
  shares: z.array(z.object({ email: z.email(), role: z.enum(SHARE_ROLES) })),
});
