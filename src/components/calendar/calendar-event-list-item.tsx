import { Clock3, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EVENT_COLORS, formatShortDate } from "@/components/calendar/calendar-shared";
import { StatusSlider } from "@/components/calendar/status-slider";
import type { CalendarEvent } from "@/lib/calendar-event";

type CalendarEventListItemProps = {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onSetStatus: (eventId: number, nextStatus: CalendarEvent["status"]) => void;
};

/** One event in the list: status slider, edit/delete, title, date and class. */
export function CalendarEventListItem({
  event,
  onEdit,
  onDelete,
  onSetStatus,
}: CalendarEventListItemProps) {
  return (
    <div
      className={`rounded-lg border border-border p-3 transition-opacity duration-300 ${
        event.status === "complete" ? "opacity-60" : "opacity-90 hover:opacity-100"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2 flex-col">
        <div className="flex flex-row items-center min-w-full justify-between">
          <StatusSlider
            status={event.status}
            onChangeStatus={(nextStatus) => onSetStatus(event.id, nextStatus)}
            eventTitle={event.title}
          />

          <div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(event)}
              aria-label={`Edit ${event.title}`}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(event)}
              aria-label={`Delete ${event.title}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-row gap-2 items-center justify-center">
          <span
            className={`inline-block size-2.5 rounded-full ${EVENT_COLORS[event.color] ?? "bg-slate-400"}`}
          />
          <p
            className={`truncate font-medium ${event.status === "complete" ? "line-through text-muted-foreground" : ""}`}
          >
            {event.title}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground flex flex-row justify-between">
        <p className="flex items-center gap-2">
          <Clock3 className="size-3.5" />
          {formatShortDate(event.date)} at {event.time}
        </p>

        <p className="flex items-center gap-2">Class: {event.color}</p>
      </div>
    </div>
  );
}
