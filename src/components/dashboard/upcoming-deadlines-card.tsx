import { CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";

import {
  branchLabelFor,
  type DatedTwig,
  formatHumanDate,
} from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";

export function UpcomingDeadlinesCard({
  snapshot,
  events,
}: {
  snapshot: WorkspaceSnapshot;
  events: DatedTwig[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Deadlines</CardTitle>
        <CardDescription>From your calendar, sorted by date.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-1">
        {events.length ? (
          events.map((event) => {
            const branch = branchLabelFor(snapshot, event.branchId);

            return (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={event.title}>
                    {event.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatHumanDate(event.dueDate)}
                    {event.dueTime ? ` at ${event.dueTime}` : null}
                  </p>
                </div>
                <div className="flex min-w-0 max-w-[45%] items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`inline-block size-2.5 shrink-0 rounded-full ${branch.colorClass}`}
                  />
                  <span className="truncate text-xs text-muted-foreground" title={branch.name}>
                    {branch.name}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No upcoming incomplete events in the next week.
          </p>
        )}

        <Button
          variant="outline"
          className="mt-2 w-full"
          nativeButton={false}
          render={<Link to="/calendar" />}
        >
          <CalendarDays className="size-4" />
          Review full calendar
        </Button>
      </CardContent>
    </Card>
  );
}
