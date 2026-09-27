import { useCallback, useEffect, useState } from "react";

import { fetchPushKey } from "@/lib/api/account-api";
import type { ApiSession } from "@/lib/api/client";
import {
  currentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/subscribe";

/**
 * Reminders, which are the one feature that only works with a server and says so.
 *
 * Three things have to line up before this can be turned on: a deployment that has VAPID
 * keys, a browser that does push, and a person who says yes. Each can be absent for its own
 * reason, so each gets its own answer rather than one "it did not work".
 */
export type ReminderState =
  | "loading"
  /** This deployment sends no reminders. Nothing is wrong; there is nothing to offer. */
  | "unavailable"
  /** This browser has no push, or no service worker. Safari in a tab, a private window. */
  | "unsupported"
  /** Offered, and not taken up. */
  | "off"
  | "on"
  /** Asked for and refused. The browser will not ask again until the user changes it back. */
  | "denied";

export function useReminders(sessionFor: () => ApiSession | null) {
  const [state, setState] = useState<ReminderState>("loading");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  /**
   * What the browser and the server between them say the situation is. Re-read rather than
   * remembered, because a subscription can be dropped from outside this app — site data
   * cleared, permission revoked in the address bar — and a remembered "on" would be a lie.
   */
  const refresh = useCallback(async () => {
    const session = sessionFor();

    if (!session) {
      setState("unavailable");
      return;
    }

    const key = await fetchPushKey(session);

    if (!key.ok || !key.value.publicKey) {
      setState("unavailable");
      return;
    }

    setVapidPublicKey(key.value.publicKey);

    const subscription = await currentPushSubscription();

    if (subscription === "unsupported") {
      setState("unsupported");
      return;
    }

    setState(subscription ? "on" : "off");
  }, [sessionFor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    const session = sessionFor();

    if (!session?.token || !vapidPublicKey) {
      return;
    }

    setIsWorking(true);

    try {
      const outcome = await subscribeToPush(session, vapidPublicKey);

      setState(
        outcome === "subscribed"
          ? "on"
          : outcome === "denied"
            ? "denied"
            : outcome === "unsupported"
              ? "unsupported"
              : "off",
      );
    } finally {
      setIsWorking(false);
    }
  }, [sessionFor, vapidPublicKey]);

  const disable = useCallback(async () => {
    const session = sessionFor();

    if (!session?.token) {
      return;
    }

    setIsWorking(true);

    try {
      await unsubscribeFromPush(session);
      setState("off");
    } finally {
      setIsWorking(false);
    }
  }, [sessionFor]);

  return { state, isWorking, enable, disable, refresh };
}
