import {
  type ApiError,
  changePassphraseRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  sessionRequestSchema,
} from "@shared/account-contract";
import { MEDIA_MAX_BYTES, mediaMetaSchema, syncRequestSchema } from "@shared/sync-contract";
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
import { getMedia, listMedia, putMedia, sync } from "./sync";
import { bearerToken } from "./tokens";

export type AppOptions = {
  sql: Sql;
  /** Decoy KDF parameters are derived from this, so it must outlive a restart. */
  serverSecret: string;
  allowedOrigins: string[];
  limiter?: RateLimiter;
};

const ERRORS: Record<ApiError["error"], { status: 400 | 401 | 409 | 413 | 429; message: string }> =
  {
    invalid_request: { status: 400, message: "That request is not one this server understands." },
    too_large: { status: 413, message: "That file is larger than this server will store." },
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

  app.post("/v1/sync", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    const parsed = syncRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    return Response.json(await sync(sql, session.user.id, parsed.data));
  });

  app.get("/v1/media", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    return Response.json({ media: await listMedia(sql, session.user.id) });
  });

  app.put("/v1/media/:id", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    const meta = mediaMetaSchema.safeParse({
      id: context.req.param("id"),
      mimeType: context.req.header("x-media-type") ?? "",
      created: Number(context.req.header("x-media-created")),
      updatedAt: Number(context.req.header("x-media-updated")),
      keyId: context.req.header("x-media-key") ?? "",
      encryption: context.req.header("x-media-encryption"),
    });

    if (!meta.success) {
      return fail("invalid_request");
    }

    const bytes = new Uint8Array(await context.req.arrayBuffer());

    // Checked after reading rather than from a header: a declared length is a claim, and
    // the thing worth refusing is what actually arrived.
    if (bytes.byteLength > MEDIA_MAX_BYTES) {
      return fail("too_large");
    }

    await putMedia(sql, session.user.id, meta.data, bytes);

    return new Response(null, { status: 204 });
  });

  app.get("/v1/media/:id", async (context) => {
    const session = await authenticate(context.req.header("authorization"));

    if (!session?.user) {
      return fail("unauthorized");
    }

    const stored = await getMedia(sql, session.user.id, context.req.param("id"));

    if (!stored) {
      return new Response(null, { status: 404 });
    }

    return new Response(new Uint8Array(stored.bytes), {
      headers: {
        // The bytes are ciphertext when the workspace has a passphrase, so the type is
        // what they will be once opened, not what is being served.
        "content-type": "application/octet-stream",
        "x-media-type": stored.meta.mimeType,
        "x-media-created": String(stored.meta.created),
        "x-media-updated": String(stored.meta.updatedAt),
        "x-media-key": stored.meta.keyId,
        "x-media-encryption": stored.meta.encryption,
      },
    });
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
