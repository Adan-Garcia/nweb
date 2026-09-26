import { z } from "zod";

import { cipherNameSchema } from "./cipher-name";

/**
 * Sync, as the server sees it.
 *
 * A row arrives as a sealed blob plus the handful of fields the server has a job to do
 * with. It does not learn what a note is called, which course it belongs to or what is in
 * it: `payload` is the whole row, sealed with the key named by `keyId`, and everything
 * outside it is either a timestamp or something a reminder needs.
 *
 * Ordering is the server's, not the client's. `updatedAt` decides which of two versions of
 * a row wins, because that is a fact about the edit. `seq` decides what a device has not
 * seen yet, because clocks on two laptops disagree and a monotonic counter does not.
 */
export const SYNC_STORES = [
  "notes-directory",
  "notes-documents",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
  /** The names above something shared: see `src/lib/share-path-model.ts`. */
  "share-paths",
] as const;

export type SyncStore = (typeof SYNC_STORES)[number];

/**
 * What a server needs to send "something is due at nine" without being able to say what.
 * Null for every row that is not a task. The fields are the ones `sealed-text.ts` leaves
 * in the clear on purpose, and no others have been added to that list.
 */
export const scheduleSchema = z
  .object({
    dueDate: z.string().nullable(),
    dueMinutes: z.number().int().min(0).max(1439).nullable(),
    timeZone: z.string(),
    status: z.string(),
  })
  .nullable();

export type Schedule = z.infer<typeof scheduleSchema>;

export const syncRowSchema = z.object({
  store: z.enum(SYNC_STORES),
  id: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  /** Which key sealed `payload`. Empty when the workspace has no passphrase. */
  keyId: z.string(),
  encryption: cipherNameSchema,
  /** The row itself, sealed and base64'd. Opaque here and on the server. */
  payload: z.string(),
  schedule: scheduleSchema,
});

export type SyncRow = z.infer<typeof syncRowSchema>;

/** One page of work. A device with a year of edits to send does it a batch at a time. */
export const SYNC_PAGE_SIZE = 200;

export const syncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  rows: z.array(syncRowSchema).max(SYNC_PAGE_SIZE),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  /** The cursor to send next time. Everything at or below it has been handed over. */
  seq: z.number().int().nonnegative(),
  rows: z.array(syncRowSchema),
  /** True when the server had more than one page to give. */
  hasMore: z.boolean(),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;

/**
 * Asking for everything under keys just granted to this device's account, from the start.
 *
 * A grant does not make rows *newer*, so a recipient whose cursor is past them would step
 * over them. Rather than re-stamping those rows for everyone who can already read them,
 * the recipient asks for them once: `after` is a cursor over this backfill alone, and the
 * answer has the same shape as a sync page.
 */
export const backfillRequestSchema = z.object({
  keyIds: z.array(z.string().min(1)).min(1).max(200),
  after: z.number().int().nonnegative(),
});

export type BackfillRequest = z.infer<typeof backfillRequestSchema>;

/**
 * Media is synced on its own, because it is the one thing here that is not small. A blob
 * goes up as raw bytes under its own id — which is a content hash, so the same picture in
 * two notes is one upload — and the row that references it travels as an ordinary row.
 */
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export const mediaMetaSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string(),
  created: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  keyId: z.string(),
  encryption: cipherNameSchema,
});

export type MediaMeta = z.infer<typeof mediaMetaSchema>;

export const mediaListSchema = z.object({
  media: z.array(mediaMetaSchema),
});

/**
 * A device asking to be told when something is due.
 *
 * The subscription is the browser's own: an endpoint at a push service and the two keys
 * that service needs to encrypt to it. The server keeps it and nothing else — it cannot
 * say what is due, only that something is (see `BACKEND.md`, "what it costs").
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

/**
 * What a device needs before it can subscribe: the server's VAPID public key.
 *
 * Public in the strict sense — it is what a browser encrypts a subscription to, and it is
 * meaningless without the private half. Served rather than compiled into the app so that
 * pointing a build at a different deployment does not mean rebuilding it. `publicKey` is
 * null when this deployment sends no reminders, which is a choice and not a failure.
 */
export const pushKeySchema = z.object({ publicKey: z.string().min(1).nullable() });

export type PushKey = z.infer<typeof pushKeySchema>;

/** How close a task has to be before it is worth saying anything. */
export const REMINDER_WINDOW_MS = 15 * 60 * 1000;
