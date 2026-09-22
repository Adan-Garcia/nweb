import {
  type ApiError,
  changePassphraseRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  sessionRequestSchema,
} from "@shared/account-contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  changePassphrase,
  createSession,
  endSession,
  keyMaterialFor,
  prelogin,
  register,
  userForToken,
} from "./accounts";
import type { Sql } from "./db";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { bearerToken } from "./tokens";

export type AppOptions = {
  sql: Sql;
  /** Decoy KDF parameters are derived from this, so it must outlive a restart. */
  serverSecret: string;
  allowedOrigins: string[];
  limiter?: RateLimiter;
};

const ERRORS: Record<ApiError["error"], { status: 400 | 401 | 409 | 429; message: string }> = {
  invalid_request: { status: 400, message: "That request is not one this server understands." },
  email_taken: { status: 409, message: "That address already has an account." },
  invalid_credentials: { status: 401, message: "That email and passphrase do not match." },
  unauthorized: { status: 401, message: "This request needs a valid session." },
  rate_limited: { status: 429, message: "Too many attempts. Wait a minute and try again." },
};

/**
 * Phase 1 of BACKEND.md: an account is a proof of a passphrase and four strings this
 * server cannot open. Every route here either checks the proof or hands the strings back.
 *
 * The database is passed in rather than reached for, which is what lets the tests run
 * against real Postgres in-process instead of against a mock of it.
 */
export function createApp({ sql, serverSecret, allowedOrigins, limiter }: AppOptions) {
  // Five attempts a minute per address. Enough that nobody notices a typo, far too few to
  // work through a list.
  const attempts = limiter ?? createRateLimiter({ limit: 5, windowMs: 60_000 });
  const app = new Hono();

  app.use("/v1/*", cors({ origin: allowedOrigins, credentials: false }));

  const fail = (error: ApiError["error"]) => {
    const { status, message } = ERRORS[error];

    return Response.json({ error, message } satisfies ApiError, { status });
  };

  app.post("/v1/auth/prelogin", async (context) => {
    const parsed = preloginRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    if (attempts.isLimited(`prelogin:${parsed.data.email}`)) {
      return fail("rate_limited");
    }

    return Response.json(await prelogin(sql, parsed.data.email, serverSecret));
  });

  app.post("/v1/auth/register", async (context) => {
    const parsed = registerRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const outcome = await register(sql, parsed.data);

    return "error" in outcome ? fail(outcome.error) : Response.json(outcome, { status: 201 });
  });

  app.post("/v1/auth/session", async (context) => {
    const parsed = sessionRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    if (attempts.isLimited(`session:${parsed.data.email}`)) {
      return fail("rate_limited");
    }

    const session = await createSession(sql, parsed.data);

    return session ? Response.json(session) : fail("invalid_credentials");
  });

  /** Everything below needs a session, and gets the user it belongs to. */
  const authenticate = async (header: string | undefined) => {
    const token = bearerToken(header);

    return token ? { token, user: await userForToken(sql, token) } : null;
  };

  app.get("/v1/keys", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    return Response.json(keyMaterialFor(session.user));
  });

  app.post("/v1/auth/passphrase", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    const parsed = changePassphraseRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const changed = await changePassphrase(sql, session.user, parsed.data, session.token);

    return changed ? new Response(null, { status: 204 }) : fail("invalid_credentials");
  });

  app.delete("/v1/auth/session", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    await endSession(sql, session.token);

    return new Response(null, { status: 204 });
  });

  return app;
}
