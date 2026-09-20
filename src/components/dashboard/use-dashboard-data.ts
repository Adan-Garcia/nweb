import { useEffect, useMemo, useState } from "react";

import { INITIAL_EVENTS } from "@/components/calendar/calendar-shared";
import { computeDashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import type { CalendarEvent } from "@/lib/calendar-event";
import { loadCalendarEvents } from "@/lib/calendar-storage";
import { listNotesDirectoryEntries } from "@/lib/notes-directory-storage";
import type { NotesDirectoryEntry } from "@/lib/notes-model";

/** Loads the calendar and notes data and derives the dashboard's numbers. */
export function useDashboardData() {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    loadCalendarEvents(INITIAL_EVENTS),
  );
  const [notesEntries, setNotesEntries] = useState<NotesDirectoryEntry[]>([]);
  const [isNotesLoading, setIsNotesLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setCalendarEvents(loadCalendarEvents(INITIAL_EVENTS));

      try {
        const entries = await listNotesDirectoryEntries();
        if (isMounted) {
          setNotesEntries(entries);
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
  }, []);

  const metrics = useMemo(
    () =>
      computeDashboardMetrics({
        calendarEvents,
        notesEntries,
        now: new Date(),
      }),
    [calendarEvents, notesEntries],
  );

  return { ...metrics, isNotesLoading };
}
