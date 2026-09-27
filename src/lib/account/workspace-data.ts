import { SYNC_STORES } from "@shared/sync-contract";

import { getNotesDb } from "../db/notes-db";

/**
 * The workspace's own rows, as a whole: whether there are any, emptying them, and dropping
 * the ones under keys that are not this device's to keep.
 *
 * "The workspace" is everything that syncs, plus the blobs notes point at and the merge
 * bases kept for sync. The lock, the account and the local profile are not in it: they say
 * who may open the workspace, not what is in it.
 */
const DATA_STORES = [...SYNC_STORES, "notes-media", "sync-bases"] as const;

/** Whether anything someone wrote is here: a note, a task or a file that is not deleted. */
export async function hasWorkspaceContent(): Promise<boolean> {
  const database = await getNotesDb();

  for (const store of ["notes-directory", "twigs", "pebbles"] as const) {
    if ((await database.getAll(store)).some((row) => !row.deletedAt)) {
      return true;
    }
  }

  return false;
}

/** Empties every data store. Used when an account's copy replaces this device's. */
export async function clearWorkspaceData(): Promise<void> {
  const database = await getNotesDb();

  for (const store of DATA_STORES) {
    await database.clear(store);
  }
}

/**
 * Deletes every row sealed under one of these keys: what somebody else shared, when this
 * device stops being on the account that was given it. Returns how many went.
 */
export async function dropRowsUnderKeys(keyIds: ReadonlySet<string>): Promise<number> {
  if (!keyIds.size) {
    return 0;
  }

  const database = await getNotesDb();
  let dropped = 0;

  for (const store of [...SYNC_STORES, "notes-media"] as const) {
    for (const row of await database.getAll(store)) {
      if (row.keyId && keyIds.has(row.keyId)) {
        await database.delete(store, row.id);
        dropped += 1;
      }
    }
  }

  return dropped;
}
