import { z } from "zod";

import { isPublicHttpsUrl } from "./sync-contract";

/**
 * Relaying a calendar feed through the sync server.
 *
 * Most calendar hosts do not send CORS headers, so a browser may not read their feeds even
 * though anyone with the link may. A device signed in to a sync server can ask it to fetch
 * the feed instead. The server sees the address and the calendar as it passes through and
 * keeps neither: it is a relay for somebody else's public-by-link file, not a store.
 *
 * It only fetches public https addresses, only hands back what reads as a calendar, and
 * only for a signed-in caller — anything looser would make it an open proxy.
 */
export const FEED_MAX_BYTES = 5 * 1024 * 1024;

export const FEED_URL_MAX_LENGTH = 2048;

export const feedRelayRequestSchema = z.object({
  url: z.url().max(FEED_URL_MAX_LENGTH).refine(isPublicHttpsUrl, "Not a public https address"),
});

export type FeedRelayRequest = z.infer<typeof feedRelayRequestSchema>;

export const feedRelayResponseSchema = z.object({ text: z.string() });

export type FeedRelayResponse = z.infer<typeof feedRelayResponseSchema>;

/** Whether text is a calendar at all: what the relay checks before handing anything back. */
export function looksLikeIcs(text: string): boolean {
  return /^\uFEFF?\s*BEGIN:VCALENDAR/i.test(text);
}
