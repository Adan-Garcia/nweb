import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarEventFilters } from "@/components/calendar/calendar-event-filters";
import { CalendarEventListItem } from "@/components/calendar/calendar-event-list-item";
import { formatHumanDate } from "@/components/calendar/calendar-shared";
import type { CalendarViewMode, EventTab } from "@/components/calendar/calendar-views";
import type { CalendarEvent } from "@/lib/calendar-event";

type CalendarEventListCardProps = {
  selectedDateKey: string | null;
  viewMode: CalendarViewMode;
  weekLabel: string;
  monthLabel: string;
  eventTab: EventTab;
  onEventTabChange: (tab: EventTab) => void;
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
  onSetEventStatus: (eventId: number, nextStatus: CalendarEvent["status"]) => void;
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
        <CalendarEventFilters
          eventTab={eventTab}
          onEventTabChange={onEventTabChange}
          hasDayFilter={Boolean(selectedDateKey)}
          onClearDayFilter={onClearDayFilter}
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          selectedClassFilter={selectedClassFilter}
          onSelectedClassFilterChange={onSelectedClassFilterChange}
          eventClasses={eventClasses}
        />

        {filteredEvents.length ? (
          filteredEvents.map((event) => (
            <CalendarEventListItem
              key={event.id}
              event={event}
              onEdit={onOpenEditEvent}
              onDelete={onDeleteEvent}
              onSetStatus={onSetEventStatus}
            />
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
