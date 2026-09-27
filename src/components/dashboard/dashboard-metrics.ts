import {
  type DatedTwig,
  dateKeyToDate,
  formatDateKey,
} from "@/components/calendar/calendar-shared";
import { branchPath, type WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import type { NotesDirectoryEntry } from "@/lib/notes/notes-model";

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

/** Branch / note, read off the entities rather than off strings copied onto the note. */
export function toLocationLabel(snapshot: WorkspaceSnapshot, entry: NotesDirectoryEntry) {
  const path = branchPath(snapshot, entry.branchId);

  return [path?.branch.name, entry.feather].filter(Boolean).join(" / ");
}

export type DashboardMetrics = {
  dueToday: DatedTwig[];
  overdueCount: number;
  upcomingEvents: DatedTwig[];
  upcomingPreview: DatedTwig[];
  recentNotes: NotesDirectoryEntry[];
  notesUpdatedThisWeekCount: number;
  nextPriority: DatedTwig | null;
};

/** Everything the dashboard shows, derived from events and notes as of `now`. */
export function computeDashboardMetrics({
  calendarEvents,
  notesEntries,
  now,
}: {
  calendarEvents: DatedTwig[];
  notesEntries: NotesDirectoryEntry[];
  now: Date;
}): DashboardMetrics {
  const todayKey = formatDateKey(now);
  const todayStart = dateKeyToDate(todayKey);
  const upcomingWindowEnd = new Date(todayStart);
  upcomingWindowEnd.setDate(todayStart.getDate() + 7);

  const dueToday = calendarEvents.filter((event) => event.dueDate === todayKey);

  const overdueCount = calendarEvents.filter((event) => {
    if (event.status === "complete") {
      return false;
    }

    return dateKeyToDate(event.dueDate) < todayStart;
  }).length;

  const upcomingEvents = [...calendarEvents]
    .filter((event) => {
      if (event.status === "complete") {
        return false;
      }

      const eventDate = dateKeyToDate(event.dueDate);
      return eventDate >= todayStart && eventDate <= upcomingWindowEnd;
    })
    .sort((left, right) => {
      return dateKeyToDate(left.dueDate).getTime() - dateKeyToDate(right.dueDate).getTime();
    });

  const recentNotes = [...notesEntries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

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
