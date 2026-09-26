import {
  SYNC_PAGE_SIZE,
  SYNC_STORES,
  syncResponseSchema,
  type SyncStore,
} from "@shared/sync-contract";

import { apiRequest, type ApiSession } from "../api/client";
import { isReadOnlyKey } from "../keys/access";
import { getNotesDb } from "../notes-db";
import { reconcileRow } from "./reconcile";
import { type StoredRow, toSyncRow } from "./wire";

/**
 * One round of sync: send what this device has changed, take what it has not seen.
 *
 * Where only one side changed a row, the rule is the one `workspace-restore.ts` implements
 * for a backup file — last write wins by `updatedAt`, with a tombstone counting as a write.
 * Where both did, `reconcile.ts` merges them against the version both started from, so two
 * people editing one shared note both keep their edits.
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
      // A reader's copy of a shared row is never sent: the server would refuse it anyway.
      if (row.updatedAt > since && !isReadOnlyKey(row.keyId)) {
        pending.push({ store, row });
      }
    }
  }

  return pending.sort((left, right) => left.row.updatedAt - right.row.updatedAt);
}

export async function runSync(
  session: ApiSession,
  state: SyncState,
): Promise<{ outcome: SyncOutcome; state: SyncState } | null> {
  const pending = await pendingRows(state);
  const batch = pending.slice(0, SYNC_PAGE_SIZE);

  const response = await apiRequest(session, "/v1/sync", {
    body: {
      since: state.cursor,
      // No cipher: each row travels under the key that sealed it, which is how a shared
      // course reaches the person it was shared with.
      rows: await Promise.all(batch.map(({ store, row }) => toSyncRow(store, row))),
    },
    schema: syncResponseSchema,
  });

  if (!response.ok) {
    return null;
  }

  let applied = 0;

  for (const row of response.value.rows) {
    if (await reconcileRow(row)) {
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
