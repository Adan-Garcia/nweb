import { useEffect } from "react";

import { startFeedRefresh } from "@/lib/feeds/feed-scheduler";

/**
 * Keeps subscribed calendars current for as long as the workspace is open, from the shell
 * so it outlives whichever page is showing. Gated on `isUsable` like the sync loop: a
 * locked workspace cannot seal the tasks a feed would write.
 */
export function useFeedRefresh(isUsable: boolean, everyMs?: number): void {
  useEffect(() => {
    if (!isUsable) {
      return;
    }

    const refresh = startFeedRefresh({ everyMs });

    return () => {
      refresh.stop();
    };
  }, [isUsable, everyMs]);
}
