import type { IcsTime } from "./ics-parse";
import { parseIcsTime } from "./ics-parse";
import { addDays, utcToZone, weekdayOf } from "./ics-time";

/**
 * Repeating events, expanded into the dates they fall on.
 *
 * Covers what school calendars write — a weekly lecture on some weekdays, a monthly
 * meeting, a daily reminder — with `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`,
 * and `BYMONTH`; `ics-occurrences.ts` applies `EXDATE` and overrides. A rule part this
 * does not know is ignored rather than refused, so an unusual rule still yields its first
 * date and its obvious cadence instead of nothing.
 *
 * Dates are expanded on the event's own calendar, and every occurrence keeps its start's
 * wall clock: a lecture at 12:25 stays at 12:25 either side of a clock change.
 */
/** Enough for a four-year degree of weekly lectures; a rule asking for more is broken. */
export const MAX_OCCURRENCES = 1000;
const MAX_STEPS = 20_000;

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

type ByDay = { weekday: number; ordinal: number | null };

type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: IcsTime | null;
  byDay: ByDay[];
  byMonthDay: number[];
  byMonth: number[];
};

function parseByDay(value: string): ByDay[] {
  return value.split(",").flatMap((part) => {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(part.trim());

    return match
      ? [
          {
            weekday: WEEKDAYS.indexOf(match[2].toUpperCase() as (typeof WEEKDAYS)[number]),
            ordinal: match[1] ? Number(match[1]) : null,
          },
        ]
      : [];
  });
}

function parseNumbers(value: string): number[] {
  return value
    .split(",")
    .map(Number)
    .filter((number) => Number.isInteger(number) && number !== 0);
}

export function parseRule(text: string): Rule | null {
  const parts = new Map(
    text.split(";").map((part) => {
      const [name, ...value] = part.split("=");

      return [name.trim().toUpperCase(), value.join("=").trim()] as const;
    }),
  );
  const freq = parts.get("FREQ")?.toUpperCase();

  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }

  const interval = Number(parts.get("INTERVAL") ?? "1");
  const count = parts.has("COUNT") ? Number(parts.get("COUNT")) : null;
  const untilText = parts.get("UNTIL");

  return {
    freq,
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
    count: count !== null && Number.isInteger(count) && count > 0 ? count : null,
    until: untilText ? parseIcsTime(untilText) : null,
    byDay: parseByDay(parts.get("BYDAY") ?? ""),
    byMonthDay: parseNumbers(parts.get("BYMONTHDAY") ?? ""),
    byMonth: parseNumbers(parts.get("BYMONTH") ?? "").filter((month) => month > 0 && month <= 12),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function keyFor(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The days of one month a rule picks, in order. `month` is 1-based. */
function monthDays(rule: Rule, year: number, month: number, startDay: number): number[] {
  const length = daysInMonth(year, month);
  const days = new Set<number>();

  for (const day of rule.byMonthDay) {
    days.add(day > 0 ? day : length + day + 1);
  }

  for (const { weekday, ordinal } of rule.byDay) {
    const first = weekdayOf(keyFor(year, month, 1));
    const matching: number[] = [];

    for (let day = 1 + ((weekday - first + 7) % 7); day <= length; day += 7) {
      matching.push(day);
    }

    const picked = ordinal === null ? matching : [matching.at(ordinal > 0 ? ordinal - 1 : ordinal)];

    for (const day of picked) {
      if (day !== undefined) {
        days.add(day);
      }
    }
  }

  // Only a rule that names no days falls back on the start's; one that names days a month
  // does not have (a fifth Monday) simply has none that month.
  if (!rule.byDay.length && !rule.byMonthDay.length) {
    days.add(startDay);
  }

  return [...days].filter((day) => day >= 1 && day <= length).sort((a, b) => a - b);
}

/** Candidate dates for the `step`th period of the rule, before COUNT and UNTIL apply. */
function periodDates(rule: Rule, start: string, step: number): string[] {
  const [year, month, day] = start.split("-").map(Number);
  const offset = step * rule.interval;

  if (rule.freq === "DAILY") {
    return [addDays(start, offset)];
  }

  if (rule.freq === "WEEKLY") {
    // Weeks start on Monday, which is iCalendar's default `WKST`.
    const monday = addDays(start, -((weekdayOf(start) + 6) % 7) + offset * 7);
    const weekdays = rule.byDay.length
      ? rule.byDay.map((entry) => entry.weekday)
      : [weekdayOf(start)];

    return [0, 1, 2, 3, 4, 5, 6]
      .map((index) => addDays(monday, index))
      .filter((date) => weekdays.includes(weekdayOf(date)));
  }

  if (rule.freq === "MONTHLY") {
    const monthIndex = month - 1 + offset;
    const nextYear = year + Math.floor(monthIndex / 12);
    const nextMonth = (monthIndex % 12) + 1;

    return monthDays(rule, nextYear, nextMonth, day).map((d) => keyFor(nextYear, nextMonth, d));
  }

  const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b) : [month];

  return months
    .filter((m) => day <= daysInMonth(year + offset, m))
    .map((m) => keyFor(year + offset, m, day));
}

/**
 * The last date `UNTIL` allows, read in the start's own frame. `UNTIL` is usually a UTC
 * instant — Google writes "ends at local midnight" as `…T045959Z` — so cutting it to its
 * UTC date would let a New York event have one more day than the calendar does. It is
 * moved onto the start's clock, and a date whose occurrence would start after it is out.
 */
function lastDateUntil(until: IcsTime, frame: RuleFrame): string {
  if (until.kind === "date") {
    return until.date;
  }

  const clock =
    until.kind === "utc" && frame.timeZone !== "UTC"
      ? utcToZone(until.date, until.minutes, frame.timeZone)
      : until;

  return frame.startMinutes === null || clock.minutes >= frame.startMinutes
    ? clock.date
    : addDays(clock.date, -1);
}

/** Where a rule's start sits: its minutes (null for a date) and the zone of its clock. */
export type RuleFrame = { startMinutes: number | null; timeZone: string };

export const DATE_FRAME: RuleFrame = { startMinutes: null, timeZone: "UTC" };

/**
 * Every date a rule falls on, from its start up to `horizon` (inclusive). The start itself
 * is always the first occurrence, as RFC 5545 says it is.
 */
export function occurrenceDates(
  start: string,
  ruleText: string,
  horizon: string,
  frame: RuleFrame = DATE_FRAME,
): string[] {
  const rule = parseRule(ruleText);

  if (!rule) {
    return [start];
  }

  const until = rule.until ? lastDateUntil(rule.until, frame) : null;
  const last = until && until < horizon ? until : horizon;
  const dates = [start];

  for (let step = 0; step < MAX_STEPS && dates.length < MAX_OCCURRENCES; step += 1) {
    const candidates = periodDates(rule, start, step).filter((date) => date > start);

    if (candidates.some((date) => date > last) || (rule.count && dates.length >= rule.count)) {
      dates.push(...candidates.filter((date) => date <= last));
      break;
    }

    dates.push(...candidates);
  }

  return dates.slice(0, rule.count ?? MAX_OCCURRENCES);
}
