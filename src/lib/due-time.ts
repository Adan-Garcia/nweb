/**
 * Turning what someone typed into something a machine can act on.
 *
 * `dueTime` is free text — "3:30 PM" is what the form takes and what the calendar shows —
 * and nothing has ever read it. A server cannot schedule from that, so a twig also carries
 * the same time as minutes since midnight, parsed here on the way in.
 *
 * What is deliberately *not* stored is an instant. A date, a wall-clock time and an IANA
 * zone name determine one, but the conversion needs real timezone data and has no right
 * answer for the hour that DST repeats or skips. Keeping the wall clock and the zone, and
 * converting where there is a timezone library to do it with, is what iCalendar does with
 * `DTSTART` and `TZID` and for the same reason.
 */
const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$|^(\d{1,2}):(\d{2})$/i;

const MINUTES_IN_DAY = 24 * 60;

/** Minutes since local midnight, or null for anything that is not a time. */
export function parseDueTime(text: string): number | null {
  const match = TIME_PATTERN.exec(text.trim());

  if (!match) {
    return null;
  }

  const [, twelveHour, twelveMinute, meridiem, twentyFourHour, twentyFourMinute] = match;

  if (meridiem) {
    const hour = Number(twelveHour);
    const minute = Number(twelveMinute ?? "0");

    if (hour < 1 || hour > 12 || minute > 59) {
      return null;
    }

    // Noon and midnight are the two the twelve-hour clock gets wrong on its own: 12 AM is
    // the start of the day and 12 PM is the middle of it.
    const hours = (hour % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);

    return hours * 60 + minute;
  }

  const hour = Number(twentyFourHour);
  const minute = Number(twentyFourMinute);

  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

/** The twelve-hour form the app has always shown, from minutes since midnight. */
export function formatDueTime(minutes: number): string {
  const clamped = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(clamped / 60);
  const minute = String(clamped % 60).padStart(2, "0");
  const meridiem = hours < 12 ? "AM" : "PM";

  return `${hours % 12 === 0 ? 12 : hours % 12}:${minute} ${meridiem}`;
}

/**
 * The zone this device is in, which is what the wall-clock time above is a wall clock in.
 * Recorded per twig rather than per account: a task written in one place keeps the time it
 * was written for, which is what someone means by "the exam is at nine".
 */
export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // An environment with no zone data at all. UTC is wrong but it is unambiguous, and
    // the wall-clock time beside it is still what the user typed.
    return "UTC";
  }
}
