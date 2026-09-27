import { feedRelayRequestSchema } from "@shared/feed-contract";
import { Hono } from "hono";

import type { Sql } from "./db";
import type { FeedFetcher } from "./feed-relay";
import { callerFor, fail } from "./http";
import type { RateLimiter } from "./rate-limit";

/**
 * The calendar feed relay. Signed-in callers only, and a few a minute each: it is there so
 * a device can refresh its own subscriptions, not so anyone can fetch through this server.
 */
export function feedRoutes({
  sql,
  fetchFeed,
  limiter,
}: {
  sql: Sql;
  fetchFeed: FeedFetcher;
  limiter: RateLimiter;
}) {
  const routes = new Hono();

  routes.post("/v1/feeds/relay", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    if (limiter.isLimited(`feeds:${caller.user.id}`)) {
      return fail("rate_limited");
    }

    const parsed = feedRelayRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const fetched = await fetchFeed(parsed.data.url);

    if (!fetched.ok) {
      return fail(fetched.reason === "too_large" ? "too_large" : "feed_unavailable");
    }

    return Response.json({ text: fetched.text });
  });

  return routes;
}
