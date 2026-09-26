import {
  SYNC_PAGE_SIZE,
  type SyncRequest,
  type SyncResponse,
  type SyncRow,
} from "@shared/sync-contract";

import { type Sql, toNumber } from "./db";
import { reachableKeyIds } from "./key-graph";

/**
 * Sync: take what a device has, give it what it has not seen.
 *
 * The rule is last write wins by `updatedAt`, which is the client's clock and is right for
 * this question — it is a fact about when the edit happened. What a device has *seen* is a
 * different question and uses `seq`, which is the server's, because two laptops disagree
 * about the time and a cursor built from their clocks would skip edits or repeat them.
 *
 * A tombstone is a row like any other. A delete made on one device beats an older edit on
 * another for exactly the same reason an edit beats an older edit.
 */
type RowRecord = {
  store: SyncRow["store"];
  id: string;
  seq: string | number;
  updated_at: string | number;
  deleted_at: string | number | null;
  key_id: string;
  encryption: SyncRow["encryption"];
  payload: string;
  due_date: string | null;
  due_minutes: number | null;
  time_zone: string | null;
  status: string | null;
};

function toSyncRow(record: RowRecord): SyncRow {
  return {
    store: record.store,
    id: record.id,
    updatedAt: toNumber(record.updated_at),
    deletedAt: record.deleted_at === null ? null : toNumber(record.deleted_at),
    keyId: record.key_id,
    encryption: record.encryption,
    payload: record.payload,
    schedule:
      record.status === null
        ? null
        : {
            dueDate: record.due_date,
            dueMinutes: record.due_minutes,
            timeZone: record.time_zone ?? "",
            status: record.status,
          },
  };
}

/**
 * Handles an edit to a row that belongs to the shared world rather than to this caller.
 *
 * Two things have to be kept apart, and conflating them is how the duplicate this exists to
 * prevent gets back in. *Does this row exist under a key the caller can reach* decides
 * whether the edit belongs to it. *Is the edit newer* decides whether it lands. A row that
 * exists but loses on `updatedAt` is still that row's edit — turning it into a row of their
 * own would leave two copies of one note, each device sure it had the only one.
 *
 * A caller who may read it but not write it has their edit dropped. The server cannot merge
 * ciphertext and must not fork it, and a reader was never offered the pen.
 *
 * Returns true when the row was somebody's shared row, however it ended.
 */
async function applySharedRow(
  sql: Sql,
  readable: string[],
  writable: string[],
  row: SyncRow,
): Promise<boolean> {
  if (!readable.length) {
    return false;
  }

  const { rows: existing } = await sql.query<{ key_id: string; user_id: string }>(
    "select key_id, user_id from rows where store = $1 and id = $2 and key_id = any($3)",
    [row.store, row.id, readable],
  );

  if (!existing.length) {
    return false;
  }

  // A writer may edit the content; they may not move the row onto a key of their own, which
  // would lock the owner out of their own course. The owner rotating their key is the same
  // operation and is allowed, because the new key is one they can reach.
  const keyId =
    row.keyId === existing[0].key_id ||
    (await reachableKeyIds(sql, existing[0].user_id)).includes(row.keyId)
      ? row.keyId
      : existing[0].key_id;

  if (writable.includes(existing[0].key_id)) {
    await sql.query(
      `update rows set
         seq = nextval('rows_seq'),
         updated_at = $4,
         deleted_at = $5,
         key_id = $6,
         encryption = $7,
         payload = $8,
         due_date = $9,
         due_minutes = $10,
         time_zone = $11,
         status = $12
       where store = $1 and id = $2 and key_id = any($3) and updated_at < $4`,
      [
        row.store,
        row.id,
        readable,
        row.updatedAt,
        row.deletedAt,
        keyId,
        row.encryption,
        row.payload,
        row.schedule?.dueDate ?? null,
        row.schedule?.dueMinutes ?? null,
        row.schedule?.timeZone ?? null,
        row.schedule?.status ?? null,
      ],
    );
  }

  return true;
}

/**
 * Applies one row if it is newer than what is stored.
 *
 * The `where` on the conflict is what makes this last-write-wins rather than
 * last-to-arrive-wins: a device that has been offline for a week and is catching up cannot
 * undo an edit made yesterday just by pushing later.
 */
async function applyRow(sql: Sql, userId: string, row: SyncRow): Promise<void> {
  await sql.query(
    `insert into rows
       (user_id, store, id, updated_at, deleted_at, key_id, encryption, payload,
        due_date, due_minutes, time_zone, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (user_id, store, id) do update set
       seq = nextval('rows_seq'),
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       key_id = excluded.key_id,
       encryption = excluded.encryption,
       payload = excluded.payload,
       due_date = excluded.due_date,
       due_minutes = excluded.due_minutes,
       time_zone = excluded.time_zone,
       status = excluded.status
     where rows.updated_at < excluded.updated_at`,
    [
      userId,
      row.store,
      row.id,
      row.updatedAt,
      row.deletedAt,
      row.keyId,
      row.encryption,
      row.payload,
      row.schedule?.dueDate ?? null,
      row.schedule?.dueMinutes ?? null,
      row.schedule?.timeZone ?? null,
      row.schedule?.status ?? null,
    ],
  );
}

export async function sync(sql: Sql, userId: string, request: SyncRequest): Promise<SyncResponse> {
  // Rows this caller owns, plus rows sealed with a key they can derive. Serving anything
  // else would be handing over bytes they cannot open, which is pointless, and publishing
  // a fact about somebody else's workspace, which is worse.
  const readable = await reachableKeyIds(sql, userId);
  const writable = await reachableKeyIds(sql, userId, "writer");

  for (const row of request.rows) {
    // An edit to something shared with this caller lands on the owner's row. Only a row
    // that is not in the shared world at all becomes one of their own.
    if (!(await applySharedRow(sql, readable, writable, row))) {
      await applyRow(sql, userId, row);
    }
  }

  // One more than a page, so "is there more" is answered by the same query rather than by
  // a second count that could disagree with it.
  const { rows } = await sql.query<RowRecord & { seq: string | number }>(
    `select * from rows
     where seq > $2 and (user_id = $1 or key_id = any($4))
     order by seq limit $3`,
    [userId, request.since, SYNC_PAGE_SIZE + 1, readable],
  );

  const page = rows.slice(0, SYNC_PAGE_SIZE);
  const seq = page.length ? toNumber(page[page.length - 1].seq) : request.since;

  return { seq, rows: page.map(toSyncRow), hasMore: rows.length > SYNC_PAGE_SIZE };
}
