import { getNotesDb } from "../db/notes-db";
import { type Preferences, PREFERENCES_ID, preferencesSchema } from "./preferences-model";

/**
 * The IndexedDB record of the preferences, which is the copy that syncs.
 *
 * Stored in the clear on purpose. It says which accent someone likes and in what order their
 * sidebar runs; the same values sit in `localStorage` for the first paint, so sealing them
 * here would hide nothing. It still travels sealed: `toSyncRow` seals every row for the wire.
 */
export async function readPreferences(): Promise<Preferences | null> {
  const database = await getNotesDb();
  const row: unknown = await database.get("preferences", PREFERENCES_ID);

  return row ? preferencesSchema.parse(row) : null;
}

/** Stores the preferences exactly as given; `stampPreferences` is what dates an edit. */
export async function writePreferences(preferences: Preferences): Promise<void> {
  const database = await getNotesDb();

  await database.put("preferences", preferences);
}
