import { getNotesDb } from "./notes-db";

/**
 * Deletes are tombstones: the row stays with a `deletedAt` so that a future sync can tell
 * "deleted here" from "never created here". Nothing ever removed those markers, so they
 * accumulated for the life of the database — a few bytes each, but forever, and every
 * `getAll()` in the app reads them before filtering them out.
 *
 * They are collected on a delay rather than on the spot, because the whole point of a
 * tombstone is to outlive the delete. Ninety days is longer than any device is plausibly
 * offline between syncs, and a device that has been away longer than that has to be
 * restored from a backup rather than merged — a tombstone would not have saved it.
 *
 * The bytes are already gone by this point. A tombstone carries no content: the note
 * document, its media and the file blobs are dropped when the delete happens.
 */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const TOMBSTONE_STORES = [
  "notes-directory",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
] as const;

export type TombstoneSweep = Record<(typeof TOMBSTONE_STORES)[number], number>;

function emptySweep(): TombstoneSweep {
  return {
    "notes-directory": 0,
    wings: 0,
    flights: 0,
    branches: 0,
    nests: 0,
    twigs: 0,
    pebbles: 0,
  };
}

/**
 * Removes every tombstone older than the retention window, in one transaction per store
 * so a large workspace does not hold one lock across all of them.
 */
export async function collectTombstones(now = Date.now()): Promise<TombstoneSweep> {
  const database = await getNotesDb();
  const cutoff = now - TOMBSTONE_RETENTION_MS;
  const swept = emptySweep();

  for (const storeName of TOMBSTONE_STORES) {
    const transaction = database.transaction(storeName, "readwrite");

    for (const row of await transaction.store.getAll()) {
      // Truthiness, not a null check: a row written before `deletedAt` existed reads back
      // undefined rather than null, and neither is a tombstone.
      if (row.deletedAt && row.deletedAt <= cutoff) {
        await transaction.store.delete(row.id);
        swept[storeName] += 1;
      }
    }

    await transaction.done;
  }

  return swept;
}

let sweep: Promise<TombstoneSweep> | null = null;

/**
 * The app's entry point for the sweep: once per page load, and never twice at the same
 * time. Collecting is housekeeping — it changes nothing a user can see — so a failure is
 * swallowed rather than surfaced, and the next load tries again.
 */
export function collectTombstonesOnce(): Promise<TombstoneSweep> {
  sweep ??= collectTombstones().catch(() => emptySweep());

  return sweep;
}

/** Test seam: the next call sweeps again. */
export function resetTombstoneSweepForTests() {
  sweep = null;
}
