import type { upgradeWebSocket } from "@hono/node-server";
import { MEDIA_MAX_BYTES } from "@shared/sync-contract";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { authRoutes } from "./auth-routes";
import { clientIpFor } from "./client-ip";
import type { Sql } from "./db";
import { fail, type RouteDeps } from "./http";
import { createLiveHub, type LiveHub } from "./live";
import { liveRoutes } from "./live-routes";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { sharingRoutes } from "./sharing-routes";
import { staticAppRoutes } from "./static-app";
import { syncRoutes } from "./sync-routes";

/**
 * The most a request body may be, by route. A page of synced rows can be large — a sealed
 * drawing is a few megabytes and a page holds up to two hundred rows — and a file has its
 * own cap. Nothing else here is more than a few kilobytes. The limit is enforced while the
 * body streams in, so an oversized request is refused before it is held in memory.
 */
const SYNC_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 1024 * 1024;

function maxBodyFor(path: string): number {
  if (path.startsWith("/v1/media/")) {
    return MEDIA_MAX_BYTES;
  }

  return path === "/v1/sync" ? SYNC_MAX_BYTES : DEFAULT_MAX_BYTES;
}

const limitBody: MiddlewareHandler = (context, next) =>
  bodyLimit({ maxSize: maxBodyFor(context.req.path), onError: () => fail("too_large") })(
    context,
    next,
  );

export type AppOptions = {
  sql: Sql;
  /** Decoy KDF parameters are derived from this, so it must outlive a restart. */
  serverSecret: string;
  allowedOrigins: string[];
  limiter?: RateLimiter;
  /** Published at `/v1/push/key`. Null when this deployment sends no reminders. */
  vapidPublicKey?: string | null;
  /** The header a proxy puts the caller's address in (`CLIENT_IP_HEADER`). */
  clientIpHeader?: string | null;
  /** Limits by caller address; one is made when none is passed. */
  addressLimiter?: RateLimiter;
  /** The built app to serve beside the API (`STATIC_DIR`); absent or null serves none. */
  staticDir?: string | null;
  /** Who may register (`REGISTRATION_EMAILS`); absent or null is anyone. */
  registrationEmails?: string[] | null;
  /** Who is connected for live nudges. One is made when none is passed. */
  live?: LiveHub;
  /**
   * The WebSocket upgrade, from the Node adapter. Absent in tests that drive the app with
   * `app.request`, which cannot upgrade: `/v1/live` is simply not mounted there.
   */
  upgrade?: typeof upgradeWebSocket;
};

/**
 * The whole server: CORS, a rate limiter, and three groups of routes over one database.
 *
 * The database is passed in rather than reached for, which is what lets the tests run
 * against real Postgres in-process instead of against a mock of it. The groups are mounted
 * at the root because the paths are already absolute — splitting them was about keeping
 * each file readable, not about giving anything a prefix.
 */
export function createApp({
  sql,
  serverSecret,
  allowedOrigins,
  limiter,
  vapidPublicKey,
  live,
  upgrade,
  clientIpHeader = null,
  addressLimiter,
  registrationEmails = null,
  staticDir = null,
}: AppOptions) {
  // Thirty a minute from one address, across every guess-taking route: generous for a
  // household behind one router, useless for working through a list.
  const addresses = addressLimiter ?? createRateLimiter({ limit: 30, windowMs: 60_000 });

  // Five attempts a minute per address. Enough that nobody notices a typo, far too few to
  // work through a list.
  const deps: RouteDeps = {
    sql,
    serverSecret,
    attempts: limiter ?? createRateLimiter({ limit: 5, windowMs: 60_000 }),
    vapidPublicKey: vapidPublicKey ?? null,
    live: live ?? createLiveHub(),
    isAddressLimited: (context) => {
      const address = clientIpFor(context, clientIpHeader);

      return address !== null && addresses.isLimited(`address:${address}`);
    },
    registrationEmails,
  };
  const app = new Hono();

  app.use("/v1/*", cors({ origin: allowedOrigins, credentials: false }));
  // Nothing here is a page, so nothing may frame it or sniff a type into it: a file served
  // back is opaque bytes, and must stay that way whatever it contains.
  app.use("*", secureHeaders({ xFrameOptions: "DENY", crossOriginResourcePolicy: "cross-origin" }));
  app.use("/v1/*", limitBody);

  app.route("/", authRoutes(deps));
  app.route("/", syncRoutes(deps));
  app.route("/", sharingRoutes(deps));

  if (upgrade) {
    app.route("/", liveRoutes({ sql, hub: deps.live, upgrade }));
  }

  // Last, so every API route has had its chance first.
  if (staticDir) {
    app.route("/", staticAppRoutes(staticDir));
  }

  return app;
}
