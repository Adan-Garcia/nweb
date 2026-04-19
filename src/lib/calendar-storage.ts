import type { CalendarEvent } from "@/components/calendar/calendar-shared"

const CALENDAR_STORAGE_KEY = "cuervo-calendar-events-v1"

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<CalendarEvent>

  return (
    typeof candidate.id === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.time === "string" &&
    (candidate.color === "Math" ||
      candidate.color === "History" ||
      candidate.color === "Physics" ||
      candidate.color === "GroupWork" ||
      candidate.color === "Chemistry") &&
    (candidate.status === "incomplete" ||
      candidate.status === "inprogress" ||
      candidate.status === "complete")
  )
}

export function loadCalendarEvents(fallbackEvents: CalendarEvent[]): CalendarEvent[] {
  if (typeof window === "undefined") {
    return fallbackEvents
  }

  const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY)

  if (!raw) {
    return fallbackEvents
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return fallbackEvents
    }

    const events = parsed.filter(isCalendarEvent)

    return events
  } catch {
    return fallbackEvents
  }
}

export function saveCalendarEvents(events: CalendarEvent[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events))
}