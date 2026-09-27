/**
 * Turning a wall clock and a zone into an instant.
 *
 * The client stores a date, minutes past midnight and an IANA zone rather than a
 * timestamp, because the conversion needs real timezone data and has no right answer for
 * the hour DST repeats or skips (`src/lib/twigs/due-time.ts` says why). This is where that
 * conversion happens, because this is where the data is.
 *
 * No dependency: `Intl` knows every zone, and what it will not do directly — give the
 * offset for a zone at an instant — falls out of formatting one and reading it back.
 */
const PARTS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = PARTS.get(timeZone);

  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  PARTS.set(timeZone, formatter);

  return formatter;
}

/** How far this zone is from UTC at this instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // What the clock in that zone said, read back as though it were UTC. The difference
  // between that and the instant itself is the offset.
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return asUtc - instant;
}

/**
 * The instant a `YYYY-MM-DD` and a minute count fall on in a zone, or null for anything
 * that is not a date, a minute count, or a zone this runtime knows.
 *
 * Solved rather than looked up: guess that the offset is what it is at the naive instant,
 * correct once, and take the second answer when the two disagree — which is the hour a
 * clock went forward or back. An ambiguous local time resolves to one of its two instants
 * rather than to an error, because a reminder an hour early beats no reminder.
 */
export function zonedInstant(dateKey: string, minutes: number, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match || minutes < 0 || minutes > 1439) {
    return null;
  }

  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Math.floor(minutes / 60),
    minutes % 60,
  );

  if (Number.isNaN(naive)) {
    return null;
  }

  try {
    const first = offsetAt(naive, timeZone);
    const guess = naive - first;
    const second = offsetAt(guess, timeZone);

    return second === first ? guess : naive - second;
  } catch {
    // A zone this runtime has no data for. Better to skip the reminder than to send it at
    // a time nobody expects.
    return null;
  }
}
