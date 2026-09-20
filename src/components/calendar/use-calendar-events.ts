import { useEffect, useState } from "react";

import { type EventFormValues, INITIAL_EVENTS } from "@/components/calendar/calendar-shared";
import { nextEventId } from "@/components/calendar/calendar-views";
import type { CalendarEvent } from "@/lib/calendar-event";
import { loadCalendarEvents, saveCalendarEvents } from "@/lib/calendar-storage";

/** The persisted list of calendar events and the operations on it. */
export function useCalendarEvents() {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    loadCalendarEvents(INITIAL_EVENTS),
  );

  useEffect(() => {
    saveCalendarEvents(calendarEvents);
  }, [calendarEvents]);

  const setEventStatus = (eventId: number, nextStatus: CalendarEvent["status"]) => {
    setCalendarEvents((prev) =>
      prev.map((calendarEvent) => {
        if (calendarEvent.id !== eventId) {
          return calendarEvent;
        }
        return { ...calendarEvent, status: nextStatus };
      }),
    );
  };

  /** Updates the event `editingEventId`, or appends a new one when it is null. */
  const saveEvent = (values: EventFormValues, editingEventId: number | null): EventFormValues => {
    const normalized: EventFormValues = {
      ...values,
      title: values.title.trim(),
      time: values.time.trim(),
    };

    if (editingEventId !== null) {
      setCalendarEvents((prev) =>
        prev.map((calendarEvent) => {
          if (calendarEvent.id !== editingEventId) {
            return calendarEvent;
          }
          return { ...calendarEvent, ...normalized };
        }),
      );
    } else {
      setCalendarEvents((prev) => [...prev, { id: nextEventId(prev), ...normalized }]);
    }

    return normalized;
  };

  const deleteEvent = (eventToDelete: CalendarEvent) => {
    const shouldDelete = window.confirm(`Delete "${eventToDelete.title}"?`);
    if (!shouldDelete) {
      return;
    }

    setCalendarEvents((prev) =>
      prev.filter((calendarEvent) => calendarEvent.id !== eventToDelete.id),
    );
  };

  return { calendarEvents, setEventStatus, saveEvent, deleteEvent };
}
