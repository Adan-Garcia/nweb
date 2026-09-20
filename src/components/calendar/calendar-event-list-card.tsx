import {
  Clock3,
  Plus,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  EVENT_COLORS,
  formatHumanDate,
  type CalendarEvent,
} from "@/components/calendar/calendar-shared";
import { StatusSlider } from "@/components/calendar/status-slider";

type CalendarEventListCardProps = {
  selectedDateKey: string | null;
  viewMode: "month" | "week";
  weekLabel: string;
  monthLabel: string;
  eventTab: "active" | "completed";
  onEventTabChange: (tab: "active" | "completed") => void;
  onClearDayFilter: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedClassFilter: string;
  onSelectedClassFilterChange: (value: string) => void;
  eventClasses: string[];
  filteredEvents: CalendarEvent[];
  onOpenAddEvent: (defaultDate?: string | null) => void;
  onOpenEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onSetEventStatus: (
    eventId: number,
    nextStatus: CalendarEvent["status"],
  ) => void;
};

export function CalendarEventListCard({
  selectedDateKey,
  viewMode,
  weekLabel,
  monthLabel,
  eventTab,
  onEventTabChange,
  onClearDayFilter,
  searchTerm,
  onSearchTermChange,
  selectedClassFilter,
  onSelectedClassFilterChange,
  eventClasses,
  filteredEvents,
  onOpenAddEvent,
  onOpenEditEvent,
  onDeleteEvent,
  onSetEventStatus,
}: CalendarEventListCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            {selectedDateKey
              ? `Events on ${formatHumanDate(selectedDateKey)}`
              : viewMode === "week"
                ? `Events in ${weekLabel}`
                : `Events in ${monthLabel}`}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Plus className="size-4" />
                  Add
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onOpenAddEvent(selectedDateKey)}>
                Add Event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={eventTab === "active" ? "default" : "outline"}
            onClick={() => onEventTabChange("active")}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={eventTab === "completed" ? "default" : "outline"}
            onClick={() => onEventTabChange("completed")}
          >
            Completed
          </Button>
          {selectedDateKey ? (
            <Button size="sm" variant="ghost" onClick={onClearDayFilter}>
              Clear day filter
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              className="pl-9"
              placeholder="Search events"
              aria-label="Search events"
            />
          </div>
          <select
            value={selectedClassFilter}
            onChange={(event) =>
              onSelectedClassFilterChange(event.target.value)
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Filter events by class"
          >
            <option value="all">All Classes</option>
            {eventClasses.map((eventClass) => (
              <option key={eventClass} value={eventClass}>
                {eventClass}
              </option>
            ))}
          </select>
        </div>

        {filteredEvents.length ? (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className={`rounded-lg border border-border p-3 transition-opacity duration-300 ${
                event.status === "complete"
                  ? "opacity-60"
                  : "opacity-90 hover:opacity-100"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2 flex-col">
                <div className="flex flex-row items-center min-w-full justify-between">
                  <StatusSlider
                    status={event.status}
                    onChangeStatus={(nextStatus) =>
                      onSetEventStatus(event.id, nextStatus)
                    }
                    eventTitle={event.title}
                  />

                  <div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onOpenEditEvent(event)}
                      aria-label={`Edit ${event.title}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDeleteEvent(event)}
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
                  {new Date(event.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  at {event.time}
                </p>

                <p className="flex items-center gap-2">Class: {event.color}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            {eventTab === "completed"
              ? "No completed events match your filters."
              : "No active events match your filters."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
