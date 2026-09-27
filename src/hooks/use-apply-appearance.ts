import { useEffect } from "react";

import { useSystemPrefersDark } from "@/hooks/use-appearance";
import { applyPreferencesToDocument } from "@/lib/preferences/preferences-cache";
import { usePreferencesStore } from "@/stores/use-preferences-store";

/**
 * Keeps `<html>` dressed in the chosen look, for as long as the app is open.
 *
 * Mounted once, at the root, because every page — the landing page and the lock screen
 * included — is themed. The boot script in `index.html` did this before the bundle loaded;
 * this takes over from it and follows every change after.
 *
 * Sync is imported when it is needed rather than up front: the entry chunk is what every
 * page pays for, and the landing page has no use for a sync client.
 */
export function useApplyAppearance(): void {
  const preferences = usePreferencesStore((state) => state.preferences);
  const hydrate = usePreferencesStore((state) => state.hydrate);
  const receive = usePreferencesStore((state) => state.receive);
  const systemPrefersDark = useSystemPrefersDark();

  useEffect(() => {
    applyPreferencesToDocument(preferences, systemPrefersDark);
  }, [preferences, systemPrefersDark]);

  useEffect(() => {
    // A database that will not open leaves the cached look in place, which is all it needs.
    hydrate().catch(() => undefined);
  }, [hydrate]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    void Promise.all([
      import("@/lib/sync/sync-service"),
      import("@/lib/preferences/preferences-storage"),
    ]).then(([{ subscribeToSyncChanges }, { readPreferences }]) => {
      if (!isMounted) {
        return;
      }

      unsubscribe = subscribeToSyncChanges((changed) => {
        if (changed.some((row) => row.store === "preferences")) {
          void readPreferences().then((stored) => {
            if (stored) {
              receive(stored);
            }
          });
        }
      });
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [receive]);
}
