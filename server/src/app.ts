import { Hono } from "hono";
import { cors } from "hono/cors";

import { authRoutes } from "./auth-routes";
import type { Sql } from "./db";
import type { RouteDeps } from "./http";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { sharingRoutes } from "./sharing-routes";
import { syncRoutes } from "./sync-routes";

export type AppOptions = {
  sql: Sql;
  /** Decoy KDF parameters are derived from this, so it must outlive a restart. */
  serverSecret: string;
  allowedOrigins: string[];
  limiter?: RateLimiter;
};

/**
 * The whole server: CORS, a rate limiter, and three groups of routes over one database.
 *
 * The database is passed in rather than reached for, which is what lets the tests run
 * against real Postgres in-process instead of against a mock of it. The groups are mounted
 * at the root because the paths are already absolute — splitting them was about keeping
 * each file readable, not about giving anything a prefix.
 */
export function createApp({ sql, serverSecret, allowedOrigins, limiter }: AppOptions) {
  // Five attempts a minute per address. Enough that nobody notices a typo, far too few to
  // work through a list.
  const deps: RouteDeps = {
    sql,
    serverSecret,
    attempts: limiter ?? createRateLimiter({ limit: 5, windowMs: 60_000 }),
  };
  const app = new Hono();

  app.use("/v1/*", cors({ origin: allowedOrigins, credentials: false }));

  app.route("/", authRoutes(deps));
  app.route("/", syncRoutes(deps));
  app.route("/", sharingRoutes(deps));

  return app;
}
