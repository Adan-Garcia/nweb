import { getNotesDb } from "../db/notes-db";
import { occurrenceDates } from "../feeds/ics-recurrence";
import { addDays } from "../feeds/ics-time";
import { isReadOnlyKey } from "../keys/access";
import type { Twig } from "./twig-model";
import { createTwig, type TwigDraft } from "./twig-storage";

/**
 * Tasks that repeat: a weekly problem set, a daily reading.
 *
 * A series is written out as one twig per date, sharing a `seriesId`, rather than stored as
 * a rule. Each occurrence then has its own status, board position and reminder, and syncs,
 * shares and backs up like any task — nothing downstream needs to know a rule exists. The
 * price is that a series has an end: `SERIES_MAX_DAYS` ahead at most, and no more than
 * `SERIES_MAX_OCCURRENCES` tasks.
 *
 * The dates come from the same RRULE expansion calendar feeds use, so "every weekday" means
 * the same thing whether a school's calendar said it or a person did.
 */
export const TWIG_REPEATS = ["none", "daily", "weekdays", "weekly", "biweekly", "monthly"] as const;

export type TwigRepeat = (typeof TWIG_REPEATS)[number];

export const TWIG_REPEAT_LABELS: Record<TwigRepeat, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
};

/** A school year, and then some. */
export const SERIES_MAX_DAYS = 400;

export const SERIES_MAX_OCCURRENCES = 200;

const RULES: Record<Exclude<TwigRepeat, "none">, string> = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
};

/** Every date a series falls on, from `start` through `until`, within the caps above. */
export function seriesDates(start: string, repeat: TwigRepeat, until: string): string[] {
  if (repeat === "none") {
    return [start];
  }

  const limit = addDays(start, SERIES_MAX_DAYS);
  const last = until < limit ? until : limit;

  // `occurrenceDates` always counts its start, which for "every weekday" may be a Saturday.
  return occurrenceDates(start, RULES[repeat], last)
    .filter((date, index) => index > 0 || repeat !== "weekdays" || isWeekday(date))
    .slice(0, SERIES_MAX_OCCURRENCES);
}

function isWeekday(dateKey: string): boolean {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();

  return day !== 0 && day !== 6;
}

/** Creates one task per date of the series, all carrying one new `seriesId`. */
export async function createTwigSeries(
  draft: TwigDraft & { dueDate: string },
  repeat: TwigRepeat,
  until: string,
): Promise<Twig[]> {
  const seriesId = repeat === "none" ? null : crypto.randomUUID();
  const created: Twig[] = [];

  for (const dueDate of seriesDates(draft.dueDate, repeat, until)) {
    created.push(await createTwig({ ...draft, dueDate, seriesId }));
  }

  return created;
}

/** Tombstones every task of a series this device may change. Returns how many. */
export async function softDeleteTwigSeries(seriesId: string): Promise<number> {
  const database = await getNotesDb();
  const gone = (await database.getAll("twigs")).filter(
    (row) => row.seriesId === seriesId && !row.deletedAt && !isReadOnlyKey(row.keyId),
  );
  const now = Date.now();
  const transaction = database.transaction("twigs", "readwrite");

  await Promise.all(
    gone.map((row) => transaction.store.put({ ...row, deletedAt: now, updatedAt: now })),
  );
  await transaction.done;

  return gone.length;
}
