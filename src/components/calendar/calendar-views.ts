import {
  dateKeyToDate,
  formatDateKey,
  startOfWeek,
} from "@/components/calendar/calendar-shared";
import type { CalendarEvent } from "@/lib/calendar-event";

export type CalendarViewMode = "month" | "week";
export type EventTab = "active" | "completed";

/** Every day shown in a month grid, padded to whole weeks (Sunday first). */
export function buildMonthCells(currentMonth: Date): Date[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const leadingDays = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: Date[] = [];

  for (let i = leadingDays; i > 0; i--) {
    cells.push(new Date(year, month, 1 - i));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (leadingDays + daysInMonth) + 1;
    cells.push(new Date(year, month + 1, nextDay));
  }

  return cells;
}

/** The seven days (Sunday first) of the week containing `focusedDate`. */
export function buildWeekDates(focusedDate: Date): Date[] {
  const start = startOfWeek(focusedDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function formatMonthLabel(currentMonth: Date): string {
  return currentMonth.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatWeekLabel(weekDates: Date[]): string {
  const start = weekDates[0];
  const end = weekDates[6];
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

export function groupEventsByDate(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  });
  return map;
}

/** Events that fall in the visible month or week. */
export function scopeEventsToView({
  events,
  viewMode,
  currentMonth,
  weekDates,
}: {
  events: CalendarEvent[];
  viewMode: CalendarViewMode;
  currentMonth: Date;
  weekDates: Date[];
}): CalendarEvent[] {
  if (viewMode === "week") {
    const weekDateKeys = new Set(weekDates.map((date) => formatDateKey(date)));
    return events.filter((event) => weekDateKeys.has(event.date));
  }

  return events.filter((event) => {
    const eventDate = dateKeyToDate(event.date);
    return (
      eventDate.getMonth() === currentMonth.getMonth() &&
      eventDate.getFullYear() === currentMonth.getFullYear()
    );
  });
}

/** Applies the day, search, class and active/completed filters. */
export function filterVisibleEvents({
  events,
  selectedDateKey,
  searchTerm,
  classFilter,
  eventTab,
}: {
  events: CalendarEvent[];
  selectedDateKey: string | null;
  searchTerm: string;
  classFilter: string;
  eventTab: EventTab;
}): CalendarEvent[] {
  const dateScopedEvents = selectedDateKey
    ? events.filter((event) => event.date === selectedDateKey)
    : events;

  const searchAndClassFiltered = dateScopedEvents.filter((event) => {
    const matchesSearch =
      searchTerm.trim().length === 0 ||
      event.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === "all" || event.color === classFilter;

    return matchesSearch && matchesClass;
  });

  if (eventTab === "completed") {
    return searchAndClassFiltered.filter((event) => event.status === "complete");
  }
  return searchAndClassFiltered.filter((event) => event.status !== "complete");
}

export function listEventClasses(events: CalendarEvent[]): string[] {
  return Array.from(new Set(events.map((event) => event.color))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function nextEventId(events: CalendarEvent[]): number {
  return (
    events.reduce((maxId, calendarEvent) => Math.max(maxId, calendarEvent.id), 0) + 1
  );
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
