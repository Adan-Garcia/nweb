import { useEffect, useMemo, useState } from "react";

import { isDatedTwig } from "@/components/calendar/calendar-shared";
import { computeDashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { listNotesDirectoryEntries } from "@/lib/notes-directory-storage";
import type { NotesDirectoryEntry } from "@/lib/notes-model";
import type { Twig } from "@/lib/twig-model";
import { listTwigs } from "@/lib/twig-storage";

/** Loads the twigs and notes and derives the dashboard's numbers. */
export function useDashboardData() {
  const [twigs, setTwigs] = useState<Twig[]>([]);
  const [notesEntries, setNotesEntries] = useState<NotesDirectoryEntry[]>([]);
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const { snapshot, refreshSnapshot } = useWorkspaceSnapshot();

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      try {
        const [entries, nextTwigs] = await Promise.all([
          listNotesDirectoryEntries(),
          listTwigs(),
          refreshSnapshot(),
        ]);

        if (isMounted) {
          setNotesEntries(entries);
          setTwigs(nextTwigs);
        }
      } finally {
        if (isMounted) {
          setIsNotesLoading(false);
        }
      }
    };

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [refreshSnapshot]);

  const metrics = useMemo(
    () =>
      computeDashboardMetrics({
        calendarEvents: twigs.filter(isDatedTwig),
        notesEntries,
        now: new Date(),
      }),
    [twigs, notesEntries],
  );

  return { ...metrics, snapshot, isNotesLoading };
}
