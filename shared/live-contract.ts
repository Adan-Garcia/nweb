import { z } from "zod";

/**
 * The live channel: a WebSocket that tells a device "something you can read changed".
 *
 * It carries no rows and no names — only a nudge — so a device that hears one runs an
 * ordinary sync round and gets the change the way it always does, sealed, through the one
 * path that validates and merges it. Missing a nudge costs latency, never data: the periodic
 * round still runs.
 *
 * The session token is the first message rather than part of the URL, because a browser
 * cannot put an `Authorization` header on a WebSocket and a token in a URL ends up in logs.
 */
export const liveClientMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});

export type LiveClientMessage = z.infer<typeof liveClientMessageSchema>;

export const liveServerMessageSchema = z.discriminatedUnion("type", [
  /** The session was accepted; nudges will follow. */
  z.object({ type: z.literal("ready") }),
  /** Rows this account can read have changed. Sync to see what. */
  z.object({ type: z.literal("changed") }),
]);

export type LiveServerMessage = z.infer<typeof liveServerMessageSchema>;

/** Closed because the session was missing or invalid. Reconnecting will not help. */
export const LIVE_CLOSE_UNAUTHORIZED = 4401;
