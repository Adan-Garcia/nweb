import { CalendarDays } from "lucide-react";

import { EVENT_COLORS, formatHumanDate } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarEvent } from "@/lib/calendar-event";

export function UpcomingDeadlinesCard({ events }: { events: CalendarEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Deadlines</CardTitle>
        <CardDescription>From your calendar, sorted by date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length ? (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatHumanDate(event.date)} at {event.time}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block size-2.5 rounded-full ${EVENT_COLORS[event.color]}`}
                />
                <span className="text-xs text-muted-foreground">{event.color}</span>
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
  );
}
