import type { IcsTime } from "./ics-parse";

/**
 * Turning a calendar's times into what a twig stores: a date, minutes since midnight, and
 * the zone that wall clock is in (`twig-model.ts`).
 *
 * A UTC time is moved onto this device's clock, which is where the person reading it is.
 * A time the file gave with a `TZID` keeps its own wall clock and zone, exactly as a twig
 * written by hand does: "the exam is at nine" means nine where the exam is. A zone this
 * browser does not recognise (Outlook writes Windows names) is read as this device's own,
 * which is what a floating time means anyway.
 *
 * Date keys are `YYYY-MM-DD` and are done in UTC arithmetic, so no local midnight or DST
 * change can move a day.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function keyToUtc(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  return utcToKey(keyToUtc(dateKey) + days * MS_PER_DAY);
}

/** 0 for Sunday, as `Date#getDay` and iCalendar's week both count. */
export function weekdayOf(dateKey: string): number {
  return new Date(keyToUtc(dateKey)).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / MS_PER_DAY);
}

/** The date key a local `Date` falls on, read off its local fields. */
export function dateKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);

  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    formatters.set(timeZone, formatter);

    return formatter;
  } catch {
    return null;
  }
}

export function isKnownTimeZone(timeZone: string): boolean {
  return timeZone !== "" && formatterFor(timeZone) !== null;
}

/** A UTC wall clock read in another zone. */
export function utcToZone(
  date: string,
  minutes: number,
  timeZone: string,
): { date: string; minutes: number } {
  const formatter = formatterFor(timeZone);

  if (!formatter) {
    return { date, minutes };
  }

  const parts = formatter.formatToParts(keyToUtc(date) + minutes * 60_000);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

type WallClock = { date: string; minutes: number | null; timeZone: string };

function toWallClock(time: IcsTime, deviceZone: string): WallClock {
  if (time.kind === "date") {
    return { date: time.date, minutes: null, timeZone: deviceZone };
  }

  if (time.kind === "utc") {
    return { ...utcToZone(time.date, time.minutes, deviceZone), timeZone: deviceZone };
  }

  const timeZone = isKnownTimeZone(time.timeZone) ? time.timeZone : deviceZone;

  return { date: time.date, minutes: time.minutes, timeZone };
}

/**
 * Midnight to the last minute of the same day, or to the next midnight, is how many
 * servers write an all-day event with times on it. Showing it as "12:00 AM" would make an
 * assignment look due at the start of the day it is due on.
 */
function spansWholeDay(start: WallClock, end: WallClock | null): boolean {
  if (start.minutes !== 0 || !end || end.minutes === null) {
    return false;
  }

  return (
    (end.date === start.date && end.minutes >= 23 * 60 + 59) ||
    (end.date === addDays(start.date, 1) && end.minutes === 0)
  );
}

export type DueAt = { dueDate: string; dueMinutes: number | null; timeZone: string };

/** When an event is due, as a twig would store it. */
export function toDueAt(start: IcsTime, end: IcsTime | null, deviceZone: string): DueAt {
  const startClock = toWallClock(start, deviceZone);
  const endClock = end ? toWallClock(end, deviceZone) : null;
  const allDay = spansWholeDay(startClock, endClock);

  return {
    dueDate: startClock.date,
    dueMinutes: allDay ? null : startClock.minutes,
    timeZone: startClock.timeZone,
  };
}
