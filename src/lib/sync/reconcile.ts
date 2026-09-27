import type { SyncRow, SyncStore } from "@shared/sync-contract";

import { getNotesDb } from "../db/notes-db";
import { isReadOnlyKey } from "../keys/access";
import { mergeStoredRows } from "./merge-row";
import { fromSyncRow, type StoredRow } from "./wire";

/**
 * Deciding what a row from the server does to the copy on this device.
 *
 * Last write wins is right when only one side changed, and wrong when both did: the loser's
 * edit is simply gone. Telling the two apart needs the version both started from, so every
 * row the server hands over is kept as the *base* for the next one — sealed, exactly as it
 * came, so it is no more readable at rest than the row itself. With it:
 *
 *   - the local row still has the base's `updatedAt`: nothing changed here, take theirs;
 *   - it does not, and theirs differs from the base too: both changed, merge the two;
 *   - it matches theirs: it is this device's own write coming back, nothing to do.
 *
 * A merge is a new edit, stamped newer than both sides, so the next round pushes it and
 * every other device converges on it by the same last-write-wins rule the server uses.
 */
export type SyncBaseRecord = { id: string; row: SyncRow };

const baseId = (store: SyncStore, id: string) => `${store}:${id}`;

async function writeBase(row: SyncRow): Promise<void> {
  const database = await getNotesDb();

  await database.put("sync-bases", { id: baseId(row.store, row.id), row });
}

async function readBase(store: SyncStore, id: string): Promise<SyncRow | null> {
  const database = await getNotesDb();

  return (await database.get("sync-bases", baseId(store, id)))?.row ?? null;
}

async function put(store: SyncStore, row: Record<string, unknown>): Promise<void> {
  const database = await getNotesDb();

  // Every payload was validated against its store's schema by `fromSyncRow`, and a merge
  // only recombines fields of two such rows.
  await database.put(store, row as never);
}

/** Both edits kept, or null when they could not be merged and last-write-wins stands. */
async function merged(
  row: SyncRow,
  base: SyncRow,
  local: StoredRow,
  remote: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const opened = await fromSyncRow(base);
  const result = await mergeStoredRows(
    row.store,
    { base: opened, local, remote },
    local.updatedAt > row.updatedAt ? "local" : "remote",
  );

  return result
    ? {
        ...result,
        id: row.id,
        updatedAt: Math.max(Date.now(), row.updatedAt + 1, local.updatedAt + 1),
      }
    : null;
}

/** Applies one pulled row. True when something on this device changed. */
export async function reconcileRow(row: SyncRow): Promise<boolean> {
  const remote = await fromSyncRow(row);

  if (!remote) {
    return false;
  }

  const database = await getNotesDb();
  const local: StoredRow | undefined = await database.get(row.store, row.id);
  const base = await readBase(row.store, row.id);

  await writeBase(row);

  if (!local) {
    await put(row.store, remote);
    return true;
  }

  if (local.updatedAt === row.updatedAt) {
    return false;
  }

  // Somebody who may only read never has an edit worth keeping: the server refused it. The
  // server's version wins outright, which is also what heals a copy that diverged before the
  // app stopped a reader typing.
  if (isReadOnlyKey(row.keyId)) {
    await put(row.store, remote);
    return true;
  }

  const localChanged = base !== null && local.updatedAt !== base.updatedAt;
  const both =
    localChanged && base.updatedAt !== row.updatedAt
      ? await merged(row, base, local, remote)
      : null;

  if (both) {
    await put(row.store, both);
    return true;
  }

  if (local.updatedAt > row.updatedAt) {
    return false;
  }

  await put(row.store, remote);
  return true;
}
