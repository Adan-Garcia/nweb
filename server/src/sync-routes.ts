import {
  backfillRequestSchema,
  MEDIA_MAX_BYTES,
  mediaMetaSchema,
  pushSubscriptionSchema,
  syncRequestSchema,
} from "@shared/sync-contract";
import { Hono } from "hono";

import { callerFor, fail, noContent, type RouteDeps } from "./http";
import { getMedia, listMedia, putMedia } from "./media";
import { forgetSubscription, saveSubscription } from "./reminders";
import { backfill, sync } from "./sync";

/**
 * Rows in, rows out, and the blobs that are too big to travel with them. Everything here is
 * opaque: the server orders it by `updatedAt` and counts it, and reads none of it.
 */
export function syncRoutes({ sql, vapidPublicKey, live }: RouteDeps) {
  const routes = new Hono();

  // No session: a VAPID public key is what a browser encrypts a subscription *to*, and it
  // is the same key for everybody. Putting it behind a session would only mean a device
  // could not find out whether reminders exist before signing in.
  routes.get("/v1/push/key", () => Response.json({ publicKey: vapidPublicKey ?? null }));

  routes.post("/v1/sync", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = syncRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    const response = await sync(sql, caller.user.id, parsed.data);

    // After the write, so a device that hears the nudge and syncs straight away finds it.
    if (parsed.data.rows.length) {
      await live.nudge(sql, {
        keyIds: [...new Set(parsed.data.rows.map((row) => row.keyId).filter(Boolean))],
        userIds: [caller.user.id],
      });
    }

    return Response.json(response);
  });

  routes.post("/v1/sync/backfill", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = backfillRequestSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    return Response.json(await backfill(sql, caller.user.id, parsed.data));
  });

  routes.get("/v1/media", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    return Response.json({ media: await listMedia(sql, caller.user.id) });
  });

  routes.put("/v1/media/:id", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
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

    await putMedia(sql, caller.user.id, meta.data, bytes);

    return noContent();
  });

  routes.get("/v1/media/:id", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const stored = await getMedia(sql, caller.user.id, context.req.param("id"));

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

  routes.post("/v1/push/subscribe", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = pushSubscriptionSchema.safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    await saveSubscription(sql, caller.user.id, parsed.data);

    return noContent();
  });

  routes.delete("/v1/push/subscribe", async (context) => {
    const caller = await callerFor(sql, context.req.header("authorization"));

    if (!caller) {
      return fail("unauthorized");
    }

    const parsed = pushSubscriptionSchema
      .pick({ endpoint: true })
      .safeParse(await context.req.json().catch(() => null));

    if (!parsed.success) {
      return fail("invalid_request");
    }

    await forgetSubscription(sql, caller.user.id, parsed.data.endpoint);

    return noContent();
  });

  return routes;
}
