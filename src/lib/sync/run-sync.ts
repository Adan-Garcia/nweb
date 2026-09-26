import {
  SYNC_PAGE_SIZE,
  SYNC_STORES,
  syncResponseSchema,
  type SyncRow,
  type SyncStore,
} from "@shared/sync-contract";

import { apiRequest, type ApiSession } from "../api/client";
import { getActiveCipher } from "../cipher";
import { getNotesDb } from "../notes-db";
import { fromSyncRow, type StoredRow, toSyncRow } from "./wire";

/**
 * One round of sync: send what this device has changed, take what it has not seen.
 *
 * The merge rule is the one `workspace-restore.ts` already implements for a backup file —
 * last write wins by `updatedAt`, with a tombstone counting as a write. It is applied here
 * rather than called from there because the shapes differ, but the rule must not: two
 * answers to "which of these two versions is the one" would be a bug nobody could see
 * until two devices disagreed.
 */
export type SyncOutcome = {
  pushed: number;
  applied: number;
  /** What the server has handed over so far. Kept for the next round. */
  cursor: number;
  hasMore: boolean;
};

export type SyncState = {
  cursor: number;
  /** `updatedAt` of the newest row this device has already sent, per store. */
  pushedThrough: Record<string, number>;
};

export const EMPTY_SYNC_STATE: SyncState = { cursor: 0, pushedThrough: {} };

/** Everything changed since this device last pushed, oldest first so a page is a prefix. */
async function pendingRows(state: SyncState): Promise<{ store: SyncStore; row: StoredRow }[]> {
  const database = await getNotesDb();
  const pending: { store: SyncStore; row: StoredRow }[] = [];

  for (const store of SYNC_STORES) {
    const since = state.pushedThrough[store] ?? 0;

    for (const row of await database.getAll(store)) {
      if (row.updatedAt > since) {
        pending.push({ store, row });
      }
    }
  }

  return pending.sort((left, right) => left.row.updatedAt - right.row.updatedAt);
}

/**
 * Writes a row from the server, if it is newer than what is here.
 *
 * The comparison is against what is stored rather than against anything remembered,
 * because a row may have been edited on this device between the push and the pull.
 */
async function applyRow(row: SyncRow): Promise<boolean> {
  const opened = await fromSyncRow(row);

  if (!opened) {
    return false;
  }

  const database = await getNotesDb();
  const existing = await database.get(row.store, row.id);

  if (existing && existing.updatedAt >= row.updatedAt) {
    return false;
  }

  await database.put(row.store, opened as never);

  return true;
}

export async function runSync(
  session: ApiSession,
  state: SyncState,
): Promise<{ outcome: SyncOutcome; state: SyncState } | null> {
  const cipher = getActiveCipher();
  const pending = await pendingRows(state);
  const batch = pending.slice(0, SYNC_PAGE_SIZE);

  const response = await apiRequest(session, "/v1/sync", {
    body: {
      since: state.cursor,
      rows: await Promise.all(batch.map(({ store, row }) => toSyncRow(store, row, cipher))),
    },
    schema: syncResponseSchema,
  });

  if (!response.ok) {
    return null;
  }

  let applied = 0;

  for (const row of response.value.rows) {
    if (await applyRow(row)) {
      applied += 1;
    }
  }

  // Only what actually went is marked as sent. A batch that was cut short leaves the rest
  // pending, and the next round picks it up from the same place.
  const pushedThrough = { ...state.pushedThrough };

  for (const { store, row } of batch) {
    pushedThrough[store] = Math.max(pushedThrough[store] ?? 0, row.updatedAt);
  }

  const next: SyncState = { cursor: response.value.seq, pushedThrough };

  return {
    state: next,
    outcome: {
      pushed: batch.length,
      applied,
      cursor: next.cursor,
      // More to do if the server has another page, or if this device had more than fitted.
      hasMore: response.value.hasMore || pending.length > batch.length,
    },
  };
}

/** Rounds until there is nothing left on either side, or until one fails. */
export async function syncUntilSettled(
  session: ApiSession,
  state: SyncState,
  maxRounds = 20,
): Promise<{ outcome: SyncOutcome; state: SyncState } | null> {
  let current = state;
  let last: { outcome: SyncOutcome; state: SyncState } | null = null;

  for (let round = 0; round < maxRounds; round += 1) {
    const result = await runSync(session, current);

    if (!result) {
      return last;
    }

    current = result.state;
    last = result;

    if (!result.outcome.hasMore) {
      return result;
    }
  }

  return last;
}
