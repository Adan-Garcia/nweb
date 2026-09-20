import type { CalendarEvent } from "@/lib/calendar-event";
import type { NotesDirectoryEntry } from "@/lib/notes-model";
import { dateKeyToDate, formatDateKey } from "@/components/calendar/calendar-shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatLastUpdated(timestamp: number, now = Date.now()) {
  const deltaMs = now - timestamp;
  const deltaMinutes = Math.floor(deltaMs / 60000);

  if (deltaMinutes < 1) {
    return "just now";
  }

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) {
    return `${deltaDays}d ago`;
  }

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function toLocationLabel(entry: NotesDirectoryEntry) {
  return [entry.branch, entry.nest, entry.feather].join(" / ");
}

export type DashboardMetrics = {
  dueToday: CalendarEvent[];
  overdueCount: number;
  upcomingEvents: CalendarEvent[];
  upcomingPreview: CalendarEvent[];
  recentNotes: NotesDirectoryEntry[];
  notesUpdatedThisWeekCount: number;
  nextPriority: CalendarEvent | null;
};

/** Everything the dashboard shows, derived from events and notes as of `now`. */
export function computeDashboardMetrics({
  calendarEvents,
  notesEntries,
  now,
}: {
  calendarEvents: CalendarEvent[];
  notesEntries: NotesDirectoryEntry[];
  now: Date;
}): DashboardMetrics {
  const todayKey = formatDateKey(now);
  const todayStart = dateKeyToDate(todayKey);
  const upcomingWindowEnd = new Date(todayStart);
  upcomingWindowEnd.setDate(todayStart.getDate() + 7);

  const dueToday = calendarEvents.filter((event) => event.date === todayKey);

  const overdueCount = calendarEvents.filter((event) => {
    if (event.status === "complete") {
      return false;
    }

    return dateKeyToDate(event.date) < todayStart;
  }).length;

  const upcomingEvents = [...calendarEvents]
    .filter((event) => {
      if (event.status === "complete") {
        return false;
      }

      const eventDate = dateKeyToDate(event.date);
      return eventDate >= todayStart && eventDate <= upcomingWindowEnd;
    })
    .sort((left, right) => {
      return (
        dateKeyToDate(left.date).getTime() - dateKeyToDate(right.date).getTime()
      );
    });

  const recentNotes = [...notesEntries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  const weekAgo = now.getTime() - 7 * DAY_MS;
  const notesUpdatedThisWeekCount = notesEntries.filter(
    (entry) => entry.updatedAt >= weekAgo,
  ).length;

  return {
    dueToday,
    overdueCount,
    upcomingEvents,
    upcomingPreview: upcomingEvents.slice(0, 5),
    recentNotes,
    notesUpdatedThisWeekCount,
    nextPriority: upcomingEvents[0] ?? null,
  };
}
