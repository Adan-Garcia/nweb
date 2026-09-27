import { FEED_MAX_BYTES, looksLikeIcs } from "@shared/feed-contract";

import { fetchExternalText } from "../api/client";
import { relayFeed } from "../api/feed-api";
import { getApiSession } from "../api/session-store";
import { type FeedError, normalizeFeedUrl } from "./feed-model";

export type FeedFetchResult = { ok: true; text: string } | { ok: false; error: FeedError };

function asCalendar(text: string): FeedFetchResult {
  // A host that wants a sign-in answers with a page, and a page read as a calendar is an
  // empty one — which would remove every task the feed had brought in.
  return looksLikeIcs(text) ? { ok: true, text } : { ok: false, error: "not-calendar" };
}

/**
 * A feed's text, read directly when its host allows it and through the sync server when it
 * does not.
 *
 * Direct comes first because it involves nobody else. Only a failure that looks like the
 * host refusing browsers — which a browser reports as a bare network error — goes to the
 * relay, and only on a device already signed in to one; a device with no server says so.
 */
export async function fetchFeedText(address: string): Promise<FeedFetchResult> {
  const url = normalizeFeedUrl(address);

  if (!url) {
    return { ok: false, error: "invalid-url" };
  }

  const direct = await fetchExternalText(url, FEED_MAX_BYTES);

  if (direct.ok) {
    return asCalendar(direct.text);
  }

  if (direct.reason !== "network") {
    return { ok: false, error: direct.reason === "too-large" ? "too-large" : "unreachable" };
  }

  const session = getApiSession();

  if (!session?.token) {
    return { ok: false, error: "blocked" };
  }

  const relayed = await relayFeed(session, url);

  if (!relayed.ok) {
    return { ok: false, error: relayed.error === "too_large" ? "too-large" : "unreachable" };
  }

  return asCalendar(relayed.value.text);
}
