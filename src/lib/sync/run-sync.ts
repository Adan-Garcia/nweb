import {
  SYNC_PAGE_SIZE,
  SYNC_STORES,
  syncResponseSchema,
  type SyncRow,
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
  /** Which rows on this device changed, so an open screen can show them without a reload. */
  changed: ChangedRow[];
  /** What the server has handed over so far. Kept for the next round. */
  cursor: number;
  hasMore: boolean;
};

export type ChangedRow = { store: SyncStore; id: string };

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

  const changed = await applyRows(response.value.rows);

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
      applied: changed.length,
      changed,
      cursor: next.cursor,
      // More to do if the server has another page, or if this device had more than fitted.
      hasMore: response.value.hasMore || pending.length > batch.length,
    },
  };
}

/** Applies pulled rows one by one, and says which of them changed something here. */
async function applyRows(rows: SyncRow[]): Promise<ChangedRow[]> {
  const changed: ChangedRow[] = [];

  for (const row of rows) {
    if (await reconcileRow(row)) {
      changed.push({ store: row.store, id: row.id });
    }
  }

  return changed;
}

/**
 * Rounds until there is nothing left on either side, or until one fails. What changed is
 * gathered across every round, so a long catch-up reports all of it and not its last page.
 */
export async function syncUntilSettled(
  session: ApiSession,
  state: SyncState,
  maxRounds = 20,
): Promise<{ outcome: SyncOutcome; state: SyncState } | null> {
  let current = state;
  let last: { outcome: SyncOutcome; state: SyncState } | null = null;
  const changed: ChangedRow[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const result = await runSync(session, current);

    if (!result) {
      return last;
    }

    changed.push(...result.outcome.changed);
    current = result.state;
    last = { ...result, outcome: { ...result.outcome, changed: [...changed] } };

    if (!result.outcome.hasMore) {
      return last;
    }
  }

  return last;
}

/**
 * Everything under keys this account was just granted, whatever the sync cursor says.
 *
 * A grant does not make rows newer, so the ordinary cursor steps straight over a share. The
 * server does not re-stamp them for everybody; this device asks for them, once, with a
 * cursor of their own that starts at zero and is thrown away when the backfill is done.
 */
export async function backfillGrants(
  session: ApiSession,
  keyIds: string[],
  maxPages = 50,
): Promise<ChangedRow[] | null> {
  const changed: ChangedRow[] = [];
  let after = 0;

  for (let page = 0; page < maxPages && keyIds.length; page += 1) {
    const response = await apiRequest(session, "/v1/sync/backfill", {
      body: { keyIds, after },
      schema: syncResponseSchema,
    });

    if (!response.ok) {
      return null;
    }

    changed.push(...(await applyRows(response.value.rows)));
    after = response.value.seq;

    if (!response.value.hasMore) {
      break;
    }
  }

  return changed;
}
