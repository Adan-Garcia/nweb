import { ChevronLeft, ChevronRight } from "lucide-react";

import { EVENT_COLORS, formatDateKey, weekDays } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarEvent } from "@/lib/calendar-event";

type CalendarGridCardProps = {
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
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
};

export function CalendarGridCard({
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
            const dayEvents = eventsByDate.get(dateKey) ?? [];
            const isToday = date.toDateString() === today.toDateString();
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
            const isSelected = dateKey === selectedDateKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`rounded-lg border p-2 text-left transition-all duration-300 opacity-90 hover:opacity-100 ${
                  viewMode === "month" ? "min-h-24" : "h-full"
                } ${isCurrentMonth ? "bg-card" : "bg-muted/40 text-muted-foreground"} ${
                  isSelected
                    ? "border-primary ring-1 ring-primary/30"
                    : isToday
                      ? "border-primary"
                      : "border-border"
                } flex flex-col items-start justify-start text-left`}
              >
                <div className="mb-1 flex w-full items-start justify-start">
                  <span
                    className={`text-sm font-semibold ${
                      isToday
                        ? "inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : ""
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>

                <div className="w-full space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className={`truncate rounded-md bg-muted px-2 py-1 text-[11px] transition-opacity duration-300 ${
                        event.status === "complete" ? "opacity-50" : "opacity-100"
                      }`}
                    >
                      <span
                        className={`mr-1 inline-block size-2 rounded-full ${EVENT_COLORS[event.color] ?? "bg-slate-400"}`}
                      />
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 ? (
                    <p className="text-[11px] text-muted-foreground">
                      +{dayEvents.length - 2} more
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
