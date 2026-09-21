import {
  type DatedTwig,
  dateKeyToDate,
  formatDateKey,
  startOfWeek,
} from "@/components/calendar/calendar-shared";

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

export function groupEventsByDate(events: DatedTwig[]): Map<string, DatedTwig[]> {
  const map = new Map<string, DatedTwig[]>();
  events.forEach((event) => {
    const list = map.get(event.dueDate) ?? [];
    list.push(event);
    map.set(event.dueDate, list);
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
  events: DatedTwig[];
  viewMode: CalendarViewMode;
  currentMonth: Date;
  weekDates: Date[];
}): DatedTwig[] {
  if (viewMode === "week") {
    const weekDateKeys = new Set(weekDates.map((date) => formatDateKey(date)));
    return events.filter((event) => weekDateKeys.has(event.dueDate));
  }

  return events.filter((event) => {
    const eventDate = dateKeyToDate(event.dueDate);
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
  events: DatedTwig[];
  selectedDateKey: string | null;
  searchTerm: string;
  classFilter: string;
  eventTab: EventTab;
}): DatedTwig[] {
  const dateScopedEvents = selectedDateKey
    ? events.filter((event) => event.dueDate === selectedDateKey)
    : events;

  const searchAndClassFiltered = dateScopedEvents.filter((event) => {
    const matchesSearch =
      searchTerm.trim().length === 0 ||
      event.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === "all" || event.branchId === classFilter;

    return matchesSearch && matchesClass;
  });

  if (eventTab === "completed") {
    return searchAndClassFiltered.filter((event) => event.status === "complete");
  }
  return searchAndClassFiltered.filter((event) => event.status !== "complete");
}

/** The branches represented in the visible events, so the filter only offers real ones. */
export function listEventBranchIds(events: DatedTwig[]): string[] {
  return Array.from(new Set(events.map((event) => event.branchId)));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
