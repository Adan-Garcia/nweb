import { sendNotification, setVapidDetails, WebPushError } from "web-push";

import type { StoredSubscription } from "./reminders";

/**
 * Delivering a notification to a push service.
 *
 * The payload is encrypted to the subscription's own keys by the push protocol itself, so
 * the service that carries it cannot read it either. What is in it is the little this
 * server knows — a count and a time — which is the same thing it could have read off its
 * own tables.
 */
export type VapidDetails = { subject: string; publicKey: string; privateKey: string };

export function configurePush(details: VapidDetails): void {
  setVapidDetails(details.subject, details.publicKey, details.privateKey);
}

/**
 * "gone" means the subscription is dead — the browser was uninstalled, or the user cleared
 * their site data — and should be dropped rather than retried. Every other failure is
 * temporary as far as this is concerned: a push service having a bad minute is not a
 * reason to forget where someone's phone is.
 */
export async function deliverPush(
  subscription: StoredSubscription,
  payload: string,
): Promise<"sent" | "gone"> {
  try {
    await sendNotification(subscription, payload);

    return "sent";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      return "gone";
    }

    return "sent";
  }
}
