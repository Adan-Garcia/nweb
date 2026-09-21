import { ChevronLeft, ChevronRight } from "lucide-react";

import { CalendarDayCell } from "@/components/calendar/calendar-day-cell";
import { type DatedTwig, formatDateKey, weekDays } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

type CalendarGridCardProps = {
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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>{viewMode === "month" ? monthLabel : weekLabel}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-border p-1">
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("month")}
            >
              Month
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("week")}
            >
              Week
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={onPrevious} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={onToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={onNext} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {weekDays.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="grid min-h-120 grid-cols-7 auto-rows-fr gap-2">
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
