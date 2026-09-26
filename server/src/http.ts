import type { ApiError } from "@shared/account-contract";

import { userForToken, type UserRow } from "./accounts";
import type { Sql } from "./db";
import type { LiveHub } from "./live";
import type { RateLimiter } from "./rate-limit";
import { bearerToken } from "./tokens";

/**
 * The two things every route group needs: the one error shape, and the answer to "who is
 * calling". Both live here rather than in a route module so that no group can quietly grow
 * a second way of saying no.
 */
const ERRORS: Record<ApiError["error"], { status: 400 | 401 | 409 | 413 | 429; message: string }> =
  {
    invalid_request: { status: 400, message: "That request is not one this server understands." },
    too_large: { status: 413, message: "That file is larger than this server will store." },
    email_taken: { status: 409, message: "That address already has an account." },
    invalid_credentials: { status: 401, message: "That email and passphrase do not match." },
    unauthorized: { status: 401, message: "This request needs a valid session." },
    rate_limited: { status: 429, message: "Too many attempts. Wait a minute and try again." },
  };

export function fail(error: ApiError["error"]): Response {
  const { status, message } = ERRORS[error];

  return Response.json({ error, message } satisfies ApiError, { status });
}

/** 204: the answer to everything this server does but cannot describe. */
export const noContent = () => new Response(null, { status: 204 });

/** What a route group is handed. The database is passed in, never reached for. */
export type RouteDeps = {
  sql: Sql;
  /** Decoy KDF parameters are derived from this, so it must outlive a restart. */
  serverSecret: string;
  attempts: RateLimiter;
  /** Published so a device can subscribe. Null when this deployment sends no reminders. */
  vapidPublicKey: string | null;
  /** Nudged after anything a connected device might want to sync. */
  live: LiveHub;
};

export type Caller = { token: string; user: UserRow };

/** The session behind a request, or null — which every authenticated route turns into a 401. */
export async function callerFor(sql: Sql, header: string | undefined): Promise<Caller | null> {
  const token = bearerToken(header);

  if (!token) {
    return null;
  }

  const user = await userForToken(sql, token);

  return user ? { token, user } : null;
}
