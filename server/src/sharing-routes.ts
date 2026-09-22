import {
  putKeysRequestSchema,
  revokeRequestSchema,
  shareRequestSchema,
} from "@shared/sharing-contract";
import { Hono } from "hono";

import { callerFor, fail, noContent, type RouteDeps } from "./http";
import { keyGraphFor, publicKeyFor, putKeys, revoke, share, sharesOf } from "./sharing";

/**
 * Who can derive which key. Every refusal here is `invalid_request`: "that key is not
 * yours" and "nobody has that address" are both things the caller can do nothing about,
 * and telling them apart would answer a question about who has an account.
 */
export function sharingRoutes({ sql, attempts }: RouteDeps) {
  const routes = new Hono();

  routes.get("/v1/keys/graph", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    return Response.json(await keyGraphFor(sql, caller.user.id));
  });

  routes.post("/v1/keys", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = putKeysRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    await putKeys(sql, caller.user.id, parsed.data);

    return noContent();
  });

  routes.post("/v1/keys/share", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = shareRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const outcome = await share(sql, caller.user.id, parsed.data);

    return outcome === "shared" ? noContent() : fail("invalid_request");
  });

  routes.post("/v1/keys/revoke", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = revokeRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const outcome = await revoke(sql, caller.user.id, parsed.data);

    return outcome === "shared" ? noContent() : fail("invalid_request");
  });

  routes.get("/v1/keys/:keyId/shares", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const shares = await sharesOf(sql, caller.user.id, context.req.param("keyId"));

    return shares ? Response.json({ shares }) : fail("invalid_request");
  });

  routes.get("/v1/users/public-key", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const email = context.req.query("email") ?? "";

    // Behind a session and rate-limited: sharing needs the recipient's key, and there is
    // no way to hand one over without confirming the address has an account.
    if (attempts.isLimited(`public-key:${caller.user.id}`)) {
      return fail("rate_limited");
    }

    const publicKey = await publicKeyFor(sql, email);

    return publicKey ? Response.json({ email, publicKey }) : fail("invalid_request");
  });

  return routes;
}
