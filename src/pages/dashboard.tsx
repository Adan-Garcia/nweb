import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  ListChecks,
} from "lucide-react";

import {
  EVENT_COLORS,
  INITIAL_EVENTS,
  formatDateKey,
  formatHumanDate,
} from "@/components/calendar/calendar-shared";
import type { CalendarEvent } from "@/lib/calendar-event";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { loadCalendarEvents } from "@/lib/calendar-storage";
import {
  listNotesDirectoryEntries,
  type NotesDirectoryEntry,
} from "@/lib/notes-storage";

import "../App.css";

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function formatLastUpdated(timestamp: number) {
  const deltaMs = Date.now() - timestamp;
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

function toLocationLabel(entry: NotesDirectoryEntry) {
  return [entry.branch, entry.nest, entry.feather].join(" / ");
}

export function DashboardPage() {
  const { isDark, toggleTheme } = useThemeMode();
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

  const todayKey = formatDateKey(new Date());
  const todayStart = useMemo(() => dateKeyToDate(todayKey), [todayKey]);
  const upcomingWindowEnd = useMemo(() => {
    const windowEnd = new Date(todayStart);
    windowEnd.setDate(todayStart.getDate() + 7);
    return windowEnd;
  }, [todayStart]);

  const dueToday = useMemo(() => {
    return calendarEvents.filter((event) => event.date === todayKey);
  }, [calendarEvents, todayKey]);

  const overdueCount = useMemo(() => {
    return calendarEvents.filter((event) => {
      if (event.status === "complete") {
        return false;
      }

      return dateKeyToDate(event.date) < todayStart;
    }).length;
  }, [calendarEvents, todayStart]);

  const upcomingEvents = useMemo(() => {
    return [...calendarEvents]
      .filter((event) => {
        if (event.status === "complete") {
          return false;
        }

        const eventDate = dateKeyToDate(event.date);
        return eventDate >= todayStart && eventDate <= upcomingWindowEnd;
      })
      .sort((left, right) => {
        return (
          dateKeyToDate(left.date).getTime() -
          dateKeyToDate(right.date).getTime()
        );
      });
  }, [calendarEvents, todayStart, upcomingWindowEnd]);

  const upcomingPreview = useMemo(() => {
    return upcomingEvents.slice(0, 5);
  }, [upcomingEvents]);

  const recentNotes = useMemo(() => {
    return [...notesEntries]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [notesEntries]);

  const notesUpdatedThisWeekCount = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return notesEntries.filter((entry) => entry.updatedAt >= weekAgo).length;
  }, [notesEntries]);

  const nextPriority = upcomingEvents[0] ?? null;

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-4">
          <div>
            <h1 className="text-4xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Your overview of upcoming events and recent notes.
            </p>
          </div>
        </div>

        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Next Priority</CardTitle>
            <CardDescription>
              {nextPriority
                ? `${nextPriority.title} on ${formatHumanDate(nextPriority.date)} at ${nextPriority.time}`
                : "No upcoming incomplete events in the next 7 days."}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due Today</CardTitle>
              <CalendarClock className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dueToday.length}</div>
              <p className="text-xs text-muted-foreground">
                Events on today&apos;s date
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Upcoming (7 days)
              </CardTitle>
              <ListChecks className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingEvents.length}</div>
              <p className="text-xs text-muted-foreground">
                Incomplete items scheduled soon
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertTriangle className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overdueCount}</div>
              <p className="text-xs text-muted-foreground">
                Incomplete events before today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Notes Updated
              </CardTitle>
              <BookOpenText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {notesUpdatedThisWeekCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Edited in the last 7 days
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <CardDescription>
                From your calendar, sorted by date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingPreview.length ? (
                upcomingPreview.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {event.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatHumanDate(event.date)} at {event.time}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`inline-block size-2.5 rounded-full ${EVENT_COLORS[event.color]}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {event.color}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No upcoming incomplete events in the next week.
                </p>
              )}

              <Button
                variant="outline"
                className="w-full"
                nativeButton={false}
                render={<a href="/calendar" />}
              >
                <CalendarDays className="size-4" />
                Review full calendar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Notes</CardTitle>
              <CardDescription>
                Your latest note activity from saved workspace documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isNotesLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading saved notes...
                </p>
              ) : recentNotes.length ? (
                recentNotes.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
                    <p className="line-clamp-1 text-sm font-semibold">
                      {toLocationLabel(entry)}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {entry.createdMode === "spatial" ? "Spatial" : "Linear"}{" "}
                        note
                      </span>
                      <span>{formatLastUpdated(entry.updatedAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No saved notes yet. Create one in Notes to start building your
                  library.
                </p>
              )}

              <Button
                variant="outline"
                className="w-full"
                nativeButton={false}
                render={<a href="/notes" />}
              >
                <CircleCheck className="size-4" />
                Open notes workspace
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </WorkspaceShell>
  );
}
