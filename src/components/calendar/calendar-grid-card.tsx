import { ChevronLeft, ChevronRight } from "lucide-react";

import { CalendarDayCell } from "@/components/calendar/calendar-day-cell";
import { type DatedTwig, formatDateKey, weekDays } from "@/components/calendar/calendar-shared";
import { SegmentedControl } from "@/components/layout/segmented-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
] as const;

type CalendarGridCardProps = {
  className?: string;
  snapshot: WorkspaceSnapshot;
  viewMode: "month" | "week";
  onViewModeChange: (mode: "month" | "week") => void;
  monthLabel: string;
  weekLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  visibleDates: Date[];
  currentMonth: Date;
  today: Date;
  selectedDateKey: string | null;
  eventsByDate: Map<string, DatedTwig[]>;
  onSelectDate: (date: Date) => void;
};

export function CalendarGridCard({
  className,
  snapshot,
  viewMode,
  onViewModeChange,
  monthLabel,
  weekLabel,
  onPrevious,
  onNext,
  onToday,
  visibleDates,
  currentMonth,
  today,
  selectedDateKey,
  eventsByDate,
  onSelectDate,
}: CalendarGridCardProps) {
  const unit = viewMode === "month" ? "month" : "week";

  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-heading">
          {viewMode === "month" ? monthLabel : weekLabel}
        </CardTitle>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Calendar view"
            value={viewMode}
            options={VIEW_OPTIONS}
            onChange={onViewModeChange}
          />
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPrevious}
              aria-label={`Previous ${unit}`}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label={`Next ${unit}`}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border bg-border gap-px">
          {weekDays.map((day) => (
            <div
              key={day}
              className="bg-muted/60 py-1.5 text-center text-caption font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {visibleDates.map((date) => {
            const dateKey = formatDateKey(date);

            return (
              <CalendarDayCell
                key={dateKey}
                snapshot={snapshot}
                date={date}
                dateKey={dateKey}
                events={eventsByDate.get(dateKey) ?? []}
                isToday={date.toDateString() === today.toDateString()}
                isCurrentMonth={date.getMonth() === currentMonth.getMonth()}
                isSelected={dateKey === selectedDateKey}
                isCompact={viewMode === "month"}
                onSelect={onSelectDate}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
