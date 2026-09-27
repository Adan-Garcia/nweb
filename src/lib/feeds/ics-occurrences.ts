import { currentTimeZone } from "../twigs/due-time";
import type { IcsEvent, IcsTime } from "./ics-parse";
import { DATE_FRAME, occurrenceDates, type RuleFrame } from "./ics-recurrence";
import { addDays, daysBetween, isKnownTimeZone } from "./ics-time";

/**
 * A calendar's events as the occurrences they stand for: one for a one-off event, one per
 * date for a repeating one, with `EXDATE`s left out and single-occurrence overrides
 * (`RECURRENCE-ID`) in place of the dates they replace.
 *
 * Every occurrence keeps its start's wall clock: a lecture at 12:25 stays at 12:25 either
 * side of a clock change.
 */
export type Occurrence = {
  /** Stable across refreshes: the UID, plus the date for one occurrence of a series. */
  key: string;
  event: IcsEvent;
  start: IcsTime;
  end: IcsTime | null;
};

/** A series' own clock: a TZID it names, this device's for a floating time, or UTC. */
function frameOf(start: IcsTime): RuleFrame {
  if (start.kind === "date") {
    return DATE_FRAME;
  }

  if (start.kind === "utc") {
    return { startMinutes: start.minutes, timeZone: "UTC" };
  }

  const timeZone = isKnownTimeZone(start.timeZone) ? start.timeZone : currentTimeZone();

  return { startMinutes: start.minutes, timeZone };
}

function shift(time: IcsTime, days: number): IcsTime {
  return { ...time, date: addDays(time.date, days) };
}

/**
 * One occurrence per date each event falls on, overrides in place of the dates they
 * replace, cancelled occurrences left out.
 */
export function expandEvents(events: IcsEvent[], horizon: string): Occurrence[] {
  const overrides = new Map(
    events
      .filter((event) => event.recurrenceId !== null)
      .map((event) => [`${event.uid}#${event.recurrenceId}`, event]),
  );
  const masters = new Set(events.filter((event) => event.rrule).map((event) => event.uid));
  const occurrences: Occurrence[] = [];

  for (const event of events) {
    if (event.recurrenceId !== null) {
      // An override of a series this file does not have stands on its own.
      if (!masters.has(event.uid) && !event.cancelled) {
        occurrences.push({
          key: `${event.uid}#${event.recurrenceId}`,
          event,
          start: event.start,
          end: event.end,
        });
      }

      continue;
    }

    if (!event.rrule) {
      if (!event.cancelled) {
        occurrences.push({ key: event.uid, event, start: event.start, end: event.end });
      }

      continue;
    }

    if (event.cancelled) {
      continue;
    }

    for (const date of occurrenceDates(
      event.start.date,
      event.rrule,
      horizon,
      frameOf(event.start),
    )) {
      const key = `${event.uid}#${date}`;
      const override = overrides.get(key);

      if (event.exdates.includes(date) || override?.cancelled) {
        continue;
      }

      if (override) {
        occurrences.push({ key, event: override, start: override.start, end: override.end });
        continue;
      }

      const offset = daysBetween(event.start.date, date);

      occurrences.push({
        key,
        event,
        start: shift(event.start, offset),
        end: event.end ? shift(event.end, offset) : null,
      });
    }
  }

  return occurrences;
}
