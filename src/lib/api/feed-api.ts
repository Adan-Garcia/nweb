import { type FeedRelayResponse, feedRelayResponseSchema } from "@shared/feed-contract";

import { apiRequest, type ApiResult, type ApiSession } from "./client";

/** Asks the sync server to fetch a calendar feed this browser may not read itself. */
export function relayFeed(session: ApiSession, url: string): Promise<ApiResult<FeedRelayResponse>> {
  return apiRequest(session, "/v1/feeds/relay", {
    body: { url },
    schema: feedRelayResponseSchema,
  });
}
