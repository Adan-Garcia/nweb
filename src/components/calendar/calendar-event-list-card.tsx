import { CalendarX2 } from "lucide-react";

import { CalendarEventFilters } from "@/components/calendar/calendar-event-filters";
import { CalendarEventListItem } from "@/components/calendar/calendar-event-list-item";
import { type DatedTwig, formatHumanDate } from "@/components/calendar/calendar-shared";
import type { CalendarViewMode, EventTab } from "@/components/calendar/calendar-views";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TwigStatus } from "@/lib/twig-model";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

type CalendarEventListCardProps = {
  className?: string;
  snapshot: WorkspaceSnapshot;
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
  eventClasses: readonly { id: string; label: string }[];
  filteredEvents: DatedTwig[];
  onOpenEditEvent: (event: DatedTwig) => void;
  onDeleteEvent: (event: DatedTwig) => void;
  onSetEventStatus: (twigId: string, nextStatus: TwigStatus) => void;
};

export function CalendarEventListCard({
  className,
  snapshot,
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
  onOpenEditEvent,
  onDeleteEvent,
  onSetEventStatus,
}: CalendarEventListCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-heading">
          {selectedDateKey
            ? `Events on ${formatHumanDate(selectedDateKey)}`
            : viewMode === "week"
              ? `Events in ${weekLabel}`
              : `Events in ${monthLabel}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
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
              snapshot={snapshot}
              event={event}
              onEdit={onOpenEditEvent}
              onDelete={onDeleteEvent}
              onSetStatus={onSetEventStatus}
            />
          ))
        ) : (
          <EmptyState
            icon={CalendarX2}
            title={
              eventTab === "completed"
                ? "No completed events match your filters."
                : "No active events match your filters."
            }
            className="py-8"
          />
        )}
      </CardContent>
    </Card>
  );
}
