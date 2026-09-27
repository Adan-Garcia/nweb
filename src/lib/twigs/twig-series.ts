import { getNotesDb } from "../db/notes-db";
import { occurrenceDates } from "../feeds/ics-recurrence";
import { addDays, daysBetween } from "../feeds/ics-time";
import { isReadOnlyKey } from "../keys/access";
import type { Twig } from "./twig-model";
import { createTwig, type TwigDraft, updateTwig } from "./twig-storage";

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

/**
 * How much of a series an edit or a delete reaches: the one occurrence, it and every later
 * one, or all of them. "Later" is by due date, which is what a person means by "following".
 */
export const SERIES_SCOPES = ["one", "following", "all"] as const;

export type SeriesScope = (typeof SERIES_SCOPES)[number];

export const SERIES_SCOPE_LABELS: Record<SeriesScope, string> = {
  one: "This event",
  following: "This and following events",
  all: "All events",
};

/** The live, writable occurrences of a series, from `fromDate` on when one is given. */
async function seriesRows(seriesId: string, fromDate: string | null) {
  const database = await getNotesDb();
  const rows = (await database.getAll("twigs")).filter(
    (row) =>
      row.seriesId === seriesId &&
      !row.deletedAt &&
      !isReadOnlyKey(row.keyId) &&
      (fromDate === null || (row.dueDate !== null && row.dueDate >= fromDate)),
  );

  return { database, rows };
}

/**
 * Tombstones the tasks of a series this device may change — every one, or those due on or
 * after `fromDate`. Returns how many.
 */
export async function softDeleteTwigSeries(
  seriesId: string,
  fromDate: string | null = null,
): Promise<number> {
  const { database, rows: gone } = await seriesRows(seriesId, fromDate);
  const now = Date.now();
  const transaction = database.transaction("twigs", "readwrite");

  await Promise.all(
    gone.map((row) => transaction.store.put({ ...row, deletedAt: now, updatedAt: now })),
  );
  await transaction.done;

  return gone.length;
}

/** What an edit to a whole series carries over. Status stays each occurrence's own. */
export type SeriesChanges = Pick<Twig, "title" | "dueTime" | "branchId" | "kind">;

/**
 * Applies one edit to the occurrences of a series — every one, or those due on or after
 * `fromDate` — and moves each by the days the edited occurrence moved, so "the weekly quiz
 * is on Thursdays now" shifts the lot rather than piling them onto one date.
 */
export async function updateTwigSeries(
  seriesId: string,
  fromDate: string | null,
  changes: SeriesChanges,
  dayShift: number,
): Promise<number> {
  const { rows } = await seriesRows(seriesId, fromDate);
  let updated = 0;

  for (const row of rows) {
    const dueDate = row.dueDate === null ? null : addDays(row.dueDate, dayShift);

    if (await updateTwig(row.id, { ...changes, dueDate })) {
      updated += 1;
    }
  }

  return updated;
}

/**
 * Turns a task that did not repeat into the first occurrence of a series: it keeps its id,
 * status and board place, and the dates after it are written as new tasks beside it.
 */
export async function repeatTwig(twig: Twig, repeat: TwigRepeat, until: string): Promise<Twig[]> {
  const start = twig.dueDate;

  if (repeat === "none" || start === null) {
    return [];
  }

  const seriesId = crypto.randomUUID();
  // The task keeps its own date even when the rule would skip it (a Saturday, weekdays).
  const later = seriesDates(start, repeat, until).filter((date) => date > start);

  if (!(await updateTwig(twig.id, { seriesId }))) {
    return [];
  }

  const created: Twig[] = [];

  for (const dueDate of later) {
    created.push(
      await createTwig({
        branchId: twig.branchId,
        title: twig.title,
        kind: twig.kind,
        dueTime: twig.dueTime,
        nestIds: twig.nestIds,
        dueDate,
        seriesId,
      }),
    );
  }

  return created;
}

/** How many days an occurrence moved, or none when either end has no date. */
export function dayShiftBetween(from: string | null, to: string | null): number {
  return from === null || to === null ? 0 : daysBetween(from, to);
}
