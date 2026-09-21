import { getNotesDb } from "./notes-db";
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
  status?: TwigStatus;
  nestIds?: string[];
  featherId?: string | null;
};

export async function listTwigs(): Promise<Twig[]> {
  const database = await getNotesDb();
  const rows = await database.getAll("twigs");

  return rows.filter((twig) => !twig.deletedAt).sort(compareTwigsByBoardOrder);
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
    status,
    boardOrder: await nextBoardOrder(status),
    featherId: draft.featherId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await database.put("twigs", twig);
  return twig;
}

export async function updateTwig(
  id: string,
  changes: Partial<Omit<Twig, "id" | "createdAt" | "deletedAt">>,
): Promise<Twig | null> {
  const database = await getNotesDb();
  const existing = await database.get("twigs", id);

  if (!existing || existing.deletedAt) {
    return null;
  }

  const next: Twig = { ...existing, ...changes, updatedAt: Date.now() };
  await database.put("twigs", next);
  return next;
}

export async function softDeleteTwig(id: string): Promise<boolean> {
  const database = await getNotesDb();
  const existing = await database.get("twigs", id);

  if (!existing || existing.deletedAt) {
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

  if (!moving) {
    return [];
  }

  const column = all.filter((twig) => twig.status === status && twig.id !== twigId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, column.length));
  const resolved = resolveBoardOrder(column, clampedIndex);
  const now = Date.now();

  if (resolved !== "renumber") {
    const next: Twig = { ...moving, status, boardOrder: resolved, updatedAt: now };
    await database.put("twigs", next);
    return [next];
  }

  const reordered = [...column];
  reordered.splice(clampedIndex, 0, moving);

  const changed = reordered.map((twig, index) => ({
    ...twig,
    status,
    boardOrder: index * BOARD_ORDER_STEP,
    updatedAt: now,
  }));

  const transaction = database.transaction("twigs", "readwrite");
  await Promise.all(changed.map((twig) => transaction.store.put(twig)));
  await transaction.done;

  return changed;
}
