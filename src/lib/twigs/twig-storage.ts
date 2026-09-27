import { openRow, openRows, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { anyReadOnly, isReadOnlyKey, ReadOnlyError } from "../keys/access";
import { cipherForObject, provisionObjectKey, wrapUnderAlso } from "../keys/object-keys";
import { currentTimeZone, parseDueTime } from "./due-time";
import {
  BOARD_ORDER_STEP,
  compareTwigsByBoardOrder,
  type Twig,
  type TwigKind,
  type TwigStatus,
} from "./twig-model";

export type TwigDraft = {
  branchId: string;
  title: string;
  kind?: TwigKind;
  dueDate?: string | null;
  dueTime?: string;
  /** Overrides the zone read off this device, which is what a restore or an import needs. */
  timeZone?: string;
  status?: TwigStatus;
  nestIds?: string[];
  featherId?: string | null;
  /** Set on each occurrence of a repeating task; see `twig-series.ts`. */
  seriesId?: string | null;
};

/**
 * Fills in the machine-readable half of a time for a row written before there was one.
 *
 * Done on read rather than in a migration: the source is `dueTime`, which is already in
 * the row, so a row can heal itself the first time it is listed and no upgrade has to walk
 * the store. A row whose text was never a time keeps a null, which is the honest answer.
 */
function withParsedTime(twig: Twig): Twig {
  if (twig.dueMinutes !== undefined && twig.dueMinutes !== null) {
    return twig;
  }

  return { ...twig, dueMinutes: parseDueTime(twig.dueTime ?? "") };
}

/**
 * Titles come back in plaintext; everything the board and the calendar sort and filter by
 * — status, board order, due date and time — was never sealed, so a list is one decrypt
 * per row and no more.
 */
export async function listTwigs(): Promise<Twig[]> {
  const database = await getNotesDb();
  const rows = await database.getAll("twigs");
  const live = await openRows(
    rows.filter((twig) => !twig.deletedAt),
    "title",
  );

  // A row from before version 14 has no `feedId` or `seriesId`: typed in by hand, once.
  return live
    .map((twig) =>
      withParsedTime({ ...twig, feedId: twig.feedId ?? null, seriesId: twig.seriesId ?? null }),
    )
    .sort(compareTwigsByBoardOrder);
}

/** New tasks land at the end of their column, clear of everything already ordered. */
async function nextBoardOrder(status: TwigStatus) {
  const existing = await listTwigs();
  const column = existing.filter((twig) => twig.status === status);

  if (!column.length) {
    return 0;
  }

  return Math.max(...column.map((twig) => twig.boardOrder)) + BOARD_ORDER_STEP;
}

/**
 * Every container this row belongs to: its course, and each tag it carries. Its key is
 * wrapped under all of them, so sharing either one reaches it.
 */
export async function containerKeyIds(branchId: string, nestIds: string[]): Promise<string[]> {
  const database = await getNotesDb();
  const branchKey = (await database.get("branches", branchId))?.keyId;
  const nestKeys = await Promise.all(
    nestIds.map(async (nestId) => (await database.get("nests", nestId))?.keyId),
  );

  return [branchKey, ...nestKeys].filter((id): id is string => Boolean(id));
}

export async function createTwig(draft: TwigDraft): Promise<Twig> {
  const database = await getNotesDb();
  const now = Date.now();
  const status = draft.status ?? "incomplete";

  const twig: Twig = {
    id: crypto.randomUUID(),
    branchId: draft.branchId,
    nestIds: draft.nestIds ?? [],
    title: draft.title,
    kind: draft.kind ?? "homework",
    dueDate: draft.dueDate ?? null,
    dueTime: draft.dueTime ?? "",
    dueMinutes: parseDueTime(draft.dueTime ?? ""),
    timeZone: draft.timeZone ?? currentTimeZone(),
    status,
    boardOrder: await nextBoardOrder(status),
    featherId: draft.featherId ?? null,
    feedId: null,
    seriesId: draft.seriesId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const parents = await containerKeyIds(twig.branchId, twig.nestIds);

  if (anyReadOnly(parents)) {
    throw new ReadOnlyError();
  }

  const cipher = await provisionObjectKey("twig", parents);

  await database.put("twigs", await sealRow(twig, "title", cipher));
  return twig;
}

export async function updateTwig(
  id: string,
  changes: Partial<Omit<Twig, "id" | "createdAt" | "deletedAt">>,
): Promise<Twig | null> {
  const database = await getNotesDb();
  const stored = await database.get("twigs", id);

  // A task shared to read is not this device's to change; the server would drop the edit.
  if (!stored || stored.deletedAt || isReadOnlyKey(stored.keyId)) {
    return null;
  }

  // Opened before the change is applied, so a caller that changes the due date and not the
  // title does not have to know that one of the two is sealed and the other is not.
  const existing = withParsedTime(await openRow(stored, "title"));
  const next: Twig = { ...existing, ...changes, updatedAt: Date.now() };

  // Nor can it be moved into, or tagged with, something shared to read.
  if (anyReadOnly(await containerKeyIds(next.branchId, next.nestIds))) {
    return null;
  }

  // The parsed half is derived, so it is re-derived whenever the text it comes from moves
  // rather than being something a caller can set out of step with it.
  if (changes.dueTime !== undefined) {
    next.dueMinutes = parseDueTime(changes.dueTime);
    next.timeZone = changes.timeZone ?? next.timeZone ?? currentTimeZone();
  }

  await database.put("twigs", await sealRow(next, "title", cipherForObject(stored.keyId)));

  // Re-tagging hangs the task's key under whatever it now carries, or the tag would be
  // shareable and lead nowhere.
  for (const parentKeyId of await containerKeyIds(next.branchId, next.nestIds)) {
    await wrapUnderAlso(stored.keyId, parentKeyId);
  }

  return next;
}

export async function softDeleteTwig(id: string): Promise<boolean> {
  const database = await getNotesDb();
  const existing = await database.get("twigs", id);

  if (!existing || existing.deletedAt || isReadOnlyKey(existing.keyId)) {
    return false;
  }

  const deletedAt = Date.now();
  await database.put("twigs", { ...existing, deletedAt, updatedAt: deletedAt });
  return true;
}

/**
 * Board order sits halfway between the neighbours a drop landed between, so a move
 * rewrites one row rather than renumbering the column.
 *
 * Halving runs out of room after about fifty drops in the same gap, so when the
 * neighbours are already adjacent the column is spread back out first.
 */
export function resolveBoardOrder(column: Twig[], targetIndex: number): number | "renumber" {
  const before = column[targetIndex - 1];
  const after = column[targetIndex];

  if (!before && !after) {
    return 0;
  }

  if (!before) {
    return after.boardOrder - BOARD_ORDER_STEP;
  }

  if (!after) {
    return before.boardOrder + BOARD_ORDER_STEP;
  }

  const gap = after.boardOrder - before.boardOrder;

  if (gap <= 1) {
    return "renumber";
  }

  return before.boardOrder + Math.floor(gap / 2);
}

/**
 * Moves a twig to a position in a status column. Returns every row that changed, so a
 * caller can apply the move to its own state without re-reading the store.
 */
export async function moveTwig({
  twigId,
  status,
  targetIndex,
}: {
  twigId: string;
  status: TwigStatus;
  targetIndex: number;
}): Promise<Twig[]> {
  const database = await getNotesDb();
  const all = await listTwigs();
  const moving = all.find((twig) => twig.id === twigId);
  // `listTwigs` hands back opened rows with no key on them; the stored rows say which key
  // each title is sealed under, and a move must re-seal it under that key and no other.
  const keyIds = new Map((await database.getAll("twigs")).map((row) => [row.id, row.keyId]));
  const sealAsStored = (twig: Twig) => sealRow(twig, "title", cipherForObject(keyIds.get(twig.id)));

  if (!moving || isReadOnlyKey(keyIds.get(twigId))) {
    return [];
  }

  const column = all.filter((twig) => twig.status === status && twig.id !== twigId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, column.length));
  const resolved = resolveBoardOrder(column, clampedIndex);
  const now = Date.now();

  if (resolved !== "renumber") {
    const next: Twig = { ...moving, status, boardOrder: resolved, updatedAt: now };
    await database.put("twigs", await sealAsStored(next));
    return [next];
  }

  const reordered = [...column];
  reordered.splice(clampedIndex, 0, moving);

  // A task shared to read keeps its place: renumbering it would be an edit nobody sends.
  const changed = reordered
    .map((twig, index) => ({
      ...twig,
      status,
      boardOrder: index * BOARD_ORDER_STEP,
      updatedAt: now,
    }))
    .filter((twig) => !isReadOnlyKey(keyIds.get(twig.id)));

  // Sealed before the transaction opens, never inside it: a transaction held across a
  // non-IndexedDB await commits itself, and the puts after it fail in a real browser.
  const sealed = await Promise.all(changed.map(sealAsStored));
  const transaction = database.transaction("twigs", "readwrite");

  await Promise.all(sealed.map((twig) => transaction.store.put(twig)));
  await transaction.done;

  return changed;
}
