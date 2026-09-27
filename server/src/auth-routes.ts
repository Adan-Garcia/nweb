import {
  changePassphraseRequestSchema,
  deleteAccountRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  sessionRequestSchema,
} from "@shared/account-contract";
import { Hono } from "hono";

import {
  changePassphrase,
  createSession,
  deleteAccount,
  endSession,
  keyMaterialFor,
  prelogin,
  register,
} from "./accounts";
import { normalizeEmail } from "./db";
import { callerFor, fail, noContent, type RouteDeps } from "./http";

/**
 * An account is a proof of a passphrase and four strings this server cannot open. Every
 * route here either checks the proof or hands those strings back.
 */
export function authRoutes({
  sql,
  serverSecret,
  attempts,
  isAddressLimited,
  registrationEmails,
}: RouteDeps) {
  const routes = new Hono();

  routes.post("/v1/auth/prelogin", async (context) => {
    const parsed = preloginRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    if (
      isAddressLimited(context) ||
      attempts.isLimited(`prelogin:${normalizeEmail(parsed.data.email)}`)
    ) {
      return fail("rate_limited");
    }

    return Response.json(await prelogin(sql, parsed.data.email, serverSecret));
  });

  routes.post("/v1/auth/register", async (context) => {
    const parsed = registerRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    // Registering costs an Argon2 hash, and "taken" is an answer about who has an account.
    const email = normalizeEmail(parsed.data.email);

    if (isAddressLimited(context) || attempts.isLimited(`register:${email}`)) {
      return fail("rate_limited");
    }

    // Before anything is hashed or looked up: an address not on the list gets the same
    // answer whether or not it has an account, so this says nothing about who does.
    if (registrationEmails && !registrationEmails.includes(email)) {
      return fail("registration_closed");
    }

    const outcome = await register(sql, parsed.data);

    return "error" in outcome ? fail(outcome.error) : Response.json(outcome, { status: 201 });
  });

  routes.post("/v1/auth/session", async (context) => {
    const parsed = sessionRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    if (
      isAddressLimited(context) ||
      attempts.isLimited(`session:${normalizeEmail(parsed.data.email)}`)
    ) {
      return fail("rate_limited");
    }

    const session = await createSession(sql, parsed.data);

    return session ? Response.json(session) : fail("invalid_credentials");
  });

  routes.delete("/v1/auth/session", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    await endSession(sql, caller.token);

    return noContent();
  });

  /** The sealed key material for this account: bytes only the passphrase opens. */
  routes.get("/v1/keys", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    return Response.json(keyMaterialFor(caller.user));
  });

  routes.post("/v1/auth/passphrase", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = changePassphraseRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const changed = await changePassphrase(sql, caller.user, parsed.data, caller.token);

    return changed ? noContent() : fail("invalid_credentials");
  });

  /** Everything this account owns, gone, after the passphrase is proved once more. */
  routes.delete("/v1/auth/account", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = deleteAccountRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    if (attempts.isLimited(`delete:${caller.user.id}`)) {
      return fail("rate_limited");
    }

    const deleted = await deleteAccount(sql, caller.user, parsed.data.authKey);

    return deleted ? noContent() : fail("invalid_credentials");
  });

  return routes;
}
