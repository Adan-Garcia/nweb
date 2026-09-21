import type { DatedTwig } from "@/components/calendar/calendar-shared";
import { formatHumanDate } from "@/components/calendar/calendar-shared";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NextPriorityCard({ event }: { event: DatedTwig | null }) {
  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Next Priority</CardTitle>
        <CardDescription>
          {event
            ? `${event.title} on ${formatHumanDate(event.dueDate)} at ${event.dueTime}`
            : "No upcoming incomplete events in the next 7 days."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
