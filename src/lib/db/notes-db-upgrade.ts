import type { IDBPTransaction, StoreNames } from "idb";
import { z } from "zod";

import { calendarEventSchema } from "../twigs/calendar-event";
import { CALENDAR_STORAGE_KEY } from "../twigs/calendar-storage";
import type { NotesDbSchema } from "./notes-db";
import {
  convertLegacyWorkspace,
  type LegacyCalendarEvent,
  legacyDirectoryEntrySchema,
} from "./workspace-migrate";

type UpgradeTransaction = IDBPTransaction<
  NotesDbSchema,
  StoreNames<NotesDbSchema>[],
  "versionchange"
>;

/**
 * Turns the five path strings on every note into records, then repoints the notes at
 * them. Runs inside the version-change transaction, so a failure anywhere leaves the
 * database on version 3 with every row untouched.
 */
export async function migrateStringPathsToEntities(transaction: UpgradeTransaction) {
  const directoryStore = transaction.objectStore("notes-directory");
  const rows = await directoryStore.getAll();

  const entries = rows.flatMap((row) => {
    const parsed = legacyDirectoryEntrySchema.safeParse(row);

    // A row already in the new shape (or unreadable) is left exactly as it is.
    return parsed.success ? [parsed.data] : [];
  });

  const converted = convertLegacyWorkspace({ entries, events: readLegacyCalendar() });

  await Promise.all([
    ...converted.wings.map((wing) => transaction.objectStore("wings").put(wing)),
    ...converted.flights.map((flight) => transaction.objectStore("flights").put(flight)),
    ...converted.branches.map((branch) => transaction.objectStore("branches").put(branch)),
    ...converted.nests.map((nest) => transaction.objectStore("nests").put(nest)),
    ...converted.directory.map((entry) => directoryStore.put(entry)),
    ...converted.twigs.map((twig) => transaction.objectStore("twigs").put(twig)),
  ]);
}

/**
 * The `localStorage` key is deliberately left in place. If this transaction aborts the
 * database stays on version 3 and the upgrade runs again; deleting the events here would
 * mean the retry found nothing.
 */
function readLegacyCalendar(): LegacyCalendarEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    return z.array(calendarEventSchema).catch([]).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}
