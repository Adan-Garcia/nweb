import { pushSubscriptionSchema } from "@shared/sync-contract";
import { z } from "zod";

import { apiRequest, type ApiSession } from "../api/client";

/**
 * Asking a browser to wake this app when something is due.
 *
 * What arrives will be vague — "something is due at nine" — because the server composing
 * it cannot read a title, and the service worker cannot either while the workspace is
 * locked. That is the boundary working, not a gap in it, and the copy that asks for
 * permission should say as much rather than promise more.
 */
export type PushOutcome = "subscribed" | "denied" | "unsupported" | "failed";

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Whether this browser has been asked about notifications yet, without asking. Only a
 * "default" answer is worth an offer: after a yes there is nothing to ask, and after a no
 * the browser will not ask again anyway.
 */
export function notificationPermission(): NotificationPermission | "unsupported" {
  return isSupported() ? Notification.permission : "unsupported";
}

/** A VAPID key travels as base64url and has to reach `subscribe` as bytes. */
export function decodeVapidKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Whether this browser already holds a subscription, without asking for permission.
 *
 * "unsupported" is distinct from "none" on purpose: a browser that cannot do push should be
 * told so, not offered a switch that will never work.
 */
export async function currentPushSubscription(): Promise<"unsupported" | boolean> {
  if (!isSupported()) {
    return "unsupported";
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function subscribeToPush(
  session: ApiSession,
  vapidPublicKey: string,
): Promise<PushOutcome> {
  if (!isSupported()) {
    return "unsupported";
  }

  if ((await Notification.requestPermission()) !== "granted") {
    return "denied";
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Web Push requires it, and it is what stops anyone else pushing to this endpoint.
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey),
      }));

    const parsed = pushSubscriptionSchema.safeParse(subscription.toJSON());

    if (!parsed.success) {
      return "failed";
    }

    const sent = await apiRequest(session, "/v1/push/subscribe", {
      body: parsed.data,
      schema: z.unknown(),
    });

    return sent.ok ? "subscribed" : "failed";
  } catch {
    // A browser that changed its mind, or a registration that is not there. Nothing here
    // is worth interrupting anyone over: they simply do not get reminders.
    return "failed";
  }
}

/** Stops the reminders, on this device and on the server that sends them. */
export async function unsubscribeFromPush(session: ApiSession): Promise<boolean> {
  if (!isSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    await apiRequest(session, "/v1/push/subscribe", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
      schema: z.unknown(),
    });

    return subscription.unsubscribe();
  } catch {
    return false;
  }
}
