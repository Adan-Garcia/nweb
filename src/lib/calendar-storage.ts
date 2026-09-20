import { calendarEventSchema, type CalendarEvent } from "./calendar-event";

const CALENDAR_STORAGE_KEY = "cuervo-calendar-events-v1";

export function loadCalendarEvents(fallbackEvents: CalendarEvent[]): CalendarEvent[] {
  if (typeof window === "undefined") {
    return fallbackEvents;
  }

  const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);

  if (!raw) {
    return fallbackEvents;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return fallbackEvents;
    }

    // Keep every stored event that is still valid; drop malformed entries.
    return parsed.flatMap((item: unknown) => {
      const result = calendarEventSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return fallbackEvents;
  }
}

export function saveCalendarEvents(events: CalendarEvent[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events));
}
