import { useCallback, useSyncExternalStore } from "react";

import { useAppearance } from "@/hooks/use-appearance";
import { useReminders } from "@/hooks/use-reminders";
import { getApiSession, subscribeToApiSession } from "@/lib/api/session-store";
import { notificationPermission } from "@/lib/push/subscribe";

/**
 * Whether to offer reminders without being asked, and the two answers to that offer.
 *
 * Offered only when it could work and has never been answered: a signed-in session (a
 * subscription is filed against an account), a server with push keys, a browser that can do
 * push and has not been asked on this device, and no earlier "Not now". Settings keeps the
 * switch for anyone who changes their mind either way.
 */
export function useReminderPrompt() {
  const session = useSyncExternalStore(subscribeToApiSession, getApiSession, () => null);
  const sessionFor = useCallback(() => (session?.token ? session : null), [session]);
  const reminders = useReminders(sessionFor);
  const { preferences, update } = useAppearance();

  const isShown =
    reminders.state === "off" &&
    preferences.reminderPrompt !== "dismissed" &&
    notificationPermission() === "default";

  return {
    isShown,
    isWorking: reminders.isWorking,
    enable: reminders.enable,
    dismiss: () => update({ reminderPrompt: "dismissed" }),
  };
}
