import { Search } from "lucide-react";

import type { EventTab } from "@/components/calendar/calendar-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CalendarEventFiltersProps = {
  eventTab: EventTab;
  onEventTabChange: (tab: EventTab) => void;
  hasDayFilter: boolean;
  onClearDayFilter: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedClassFilter: string;
  onSelectedClassFilterChange: (value: string) => void;
  eventClasses: readonly { id: string; label: string }[];
};

/** Active/completed tabs, day-filter reset, search box and class filter. */
export function CalendarEventFilters({
  eventTab,
  onEventTabChange,
  hasDayFilter,
  onClearDayFilter,
  searchTerm,
  onSearchTermChange,
  selectedClassFilter,
  onSelectedClassFilterChange,
  eventClasses,
}: CalendarEventFiltersProps) {
  return (
    <>
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
        {hasDayFilter ? (
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
          onChange={(event) => onSelectedClassFilterChange(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter events by class"
        >
          <option value="all">All Classes</option>
          {eventClasses.map((eventClass) => (
            <option key={eventClass.id} value={eventClass.id}>
              {eventClass.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
