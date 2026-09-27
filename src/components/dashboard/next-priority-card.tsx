import { Flag } from "lucide-react";

import type { DatedTwig } from "@/components/calendar/calendar-shared";
import { formatHumanDate } from "@/components/calendar/calendar-shared";

export function NextPriorityCard({ event }: { event: DatedTwig | null }) {
  return (
    <section
      aria-label="Next priority"
      className="flex items-start gap-3 rounded-lg border border-l-4 border-l-primary bg-card p-4"
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-primary">
        <Flag className="size-4" aria-hidden="true" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <h2 className="text-heading">Next Priority</h2>
        <p className="text-body text-muted-foreground">
          {event
            ? `${event.title} on ${formatHumanDate(event.dueDate)} at ${event.dueTime}`
            : "No upcoming incomplete events in the next 7 days."}
        </p>
      </div>
    </section>
  );
}
