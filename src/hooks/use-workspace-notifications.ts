import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { loadWorkspaceSnapshot } from "@/lib/hierarchy/workspace-storage";
import { buildNotifications, countUrgent } from "@/lib/twigs/notifications";
import type { Twig } from "@/lib/twigs/twig-model";
import { listTwigs } from "@/lib/twigs/twig-storage";

/**
 * What is late or coming up, for the bell in the sidebar. This is the in-app half of
 * notifications: it needs no server, and it only knows what is due while the app is open.
 */
export function useWorkspaceNotifications() {
  const [twigs, setTwigs] = useState<Twig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { snapshot, setSnapshot } = useWorkspaceSnapshot();

  const refresh = useCallback(async () => {
    const [nextTwigs, nextSnapshot] = await Promise.all([listTwigs(), loadWorkspaceSnapshot()]);

    setTwigs(nextTwigs);
    setSnapshot(nextSnapshot);
  }, [setSnapshot]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const [nextTwigs, nextSnapshot] = await Promise.all([listTwigs(), loadWorkspaceSnapshot()]);

        if (isMounted) {
          setTwigs(nextTwigs);
          setSnapshot(nextSnapshot);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [setSnapshot]);

  const notifications = useMemo(
    () => buildNotifications(twigs, snapshot, new Date()),
    [twigs, snapshot],
  );

  return {
    notifications,
    urgentCount: countUrgent(notifications),
    isLoading,
    refresh,
  };
}
