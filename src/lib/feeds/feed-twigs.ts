import { openRow, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { isReadOnlyKey } from "../keys/access";
import { provisionObjectKey } from "../keys/object-keys";
import { formatDueTime } from "../twigs/due-time";
import { BOARD_ORDER_STEP, type Twig, type TwigStatus } from "../twigs/twig-model";
import { containerKeyIds, listTwigs, updateTwig } from "../twigs/twig-storage";
import type { FeedItem } from "./feed-rules";

/**
 * Writing a feed's events as twigs, and keeping them in step with the feed.
 *
 * A twig's id is derived from its feed and the event's own key, so fetching the same
 * calendar again finds the same rows instead of adding a second copy of each — on this
 * device, and on another one subscribed to the same feed, whose rows then meet in sync as
 * one. What the feed says (title, date, time, course, kind) is the feed's; what someone did
 * with the task (its status, its place on the board, its tags) is theirs and is left alone.
 *
 * A task deleted by hand stays deleted: its tombstone has the same id the feed would write,
 * and a tombstone is never brought back.
 */
export type FeedApplyResult = { added: number; updated: number; removed: number };

export async function feedTwigId(feedId: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${feedId}\n${key}`),
  );
  const hex = [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  // UUID-shaped, version 8 ("custom"), so it sits among the random ones without looking odd.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type Wanted = Pick<Twig, "title" | "dueDate" | "dueTime" | "timeZone" | "kind" | "branchId">;

function wantedFor(item: FeedItem, branchId: string): Wanted {
  return {
    title: item.title,
    dueDate: item.dueDate,
    dueTime: item.dueMinutes === null ? "" : formatDueTime(item.dueMinutes),
    timeZone: item.timeZone,
    kind: item.kind,
    branchId,
  };
}

function differs(current: Twig, wanted: Wanted): boolean {
  return (Object.keys(wanted) as (keyof Wanted)[]).some(
    (field) => current[field] !== wanted[field],
  );
}

/** Where the next new task in each column goes: after everything already in it. */
async function boardOrderCounter(): Promise<(status: TwigStatus) => number> {
  const next = new Map<TwigStatus, number>();

  for (const twig of await listTwigs()) {
    next.set(twig.status, Math.max(next.get(twig.status) ?? 0, twig.boardOrder + BOARD_ORDER_STEP));
  }

  return (status) => {
    const order = next.get(status) ?? 0;

    next.set(status, order + BOARD_ORDER_STEP);
    return order;
  };
}

export async function applyFeedItems({
  feedId,
  items,
  branchFor,
  cutoff,
  completePast,
  today,
}: {
  feedId: string;
  items: FeedItem[];
  branchFor: (item: FeedItem) => string;
  /** Events due before this date key are neither brought in nor changed; null is none. */
  cutoff: string | null;
  completePast: boolean;
  today: string;
}): Promise<FeedApplyResult> {
  const database = await getNotesDb();
  const stored = new Map((await database.getAll("twigs")).map((row) => [row.id, row]));
  const wanted = new Map<string, FeedItem>();

  for (const item of items) {
    wanted.set(await feedTwigId(feedId, item.key), item);
  }

  const created: Twig[] = [];
  const nextOrder = await boardOrderCounter();
  let updated = 0;

  for (const [id, item] of wanted) {
    // Long past is left as it is: not brought in, not moved, and — since it is still in
    // `wanted` — not removed either.
    if (cutoff !== null && item.dueDate < cutoff) {
      continue;
    }

    const row = stored.get(id);
    const fields = wantedFor(item, branchFor(item));

    if (row) {
      if (
        !row.deletedAt &&
        !isReadOnlyKey(row.keyId) &&
        differs(await openRow(row, "title"), fields)
      ) {
        updated += (await updateTwig(id, fields)) ? 1 : 0;
      }

      continue;
    }

    const status: TwigStatus = completePast && item.dueDate < today ? "complete" : "incomplete";
    const now = Date.now();

    created.push({
      id,
      ...fields,
      nestIds: [],
      dueMinutes: item.dueMinutes,
      status,
      boardOrder: nextOrder(status),
      featherId: null,
      feedId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Sealed before the transaction opens: one held across a non-IndexedDB await commits
  // itself, and the puts after it fail in a real browser.
  const sealed: Twig[] = [];

  for (const twig of created) {
    const cipher = await provisionObjectKey("twig", await containerKeyIds(twig.branchId, []));

    sealed.push(await sealRow(twig, "title", cipher));
  }

  const gone = [...stored.values()].filter(
    (row) =>
      row.feedId === feedId && !row.deletedAt && !wanted.has(row.id) && !isReadOnlyKey(row.keyId),
  );
  const now = Date.now();
  const transaction = database.transaction("twigs", "readwrite");

  await Promise.all([
    ...sealed.map((row) => transaction.store.put(row)),
    ...gone.map((row) => transaction.store.put({ ...row, deletedAt: now, updatedAt: now })),
  ]);
  await transaction.done;

  return { added: created.length, updated, removed: gone.length };
}

/** Removes every task a feed brought in, for a feed being removed along with its tasks. */
export async function removeFeedTwigs(feedId: string): Promise<number> {
  const database = await getNotesDb();
  const gone = (await database.getAll("twigs")).filter(
    (row) => row.feedId === feedId && !row.deletedAt && !isReadOnlyKey(row.keyId),
  );
  const now = Date.now();
  const transaction = database.transaction("twigs", "readwrite");

  await Promise.all(
    gone.map((row) => transaction.store.put({ ...row, deletedAt: now, updatedAt: now })),
  );
  await transaction.done;

  return gone.length;
}
