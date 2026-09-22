import { useEffect } from "react";

import { startBackgroundSync } from "@/lib/sync/sync-service";

/**
 * Keeps this device up to date for as long as the workspace is open.
 *
 * Started from the shell rather than from a page, because it should outlive whichever
 * screen someone happens to be on. It does nothing at all until there is a session — the
 * service checks for one each round — so a device with no account pays a timer and no
 * requests.
 *
 * `isUsable` is the gate, and it matters: a locked workspace has no key, and syncing into
 * one would hand it rows it cannot open and write them back none the wiser.
 */
export function useBackgroundSync(isUsable: boolean, everyMs?: number): void {
  useEffect(() => {
    if (!isUsable) {
      return;
    }

    const sync = startBackgroundSync({ everyMs });

    return () => {
      sync.stop();
    };
  }, [isUsable, everyMs]);
}
