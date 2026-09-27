import {
  compareTwigsByBoardOrder,
  type Twig,
  TWIG_STATUS_LABELS,
  TWIG_STATUSES,
  type TwigStatus,
} from "./twig-model";

export type BoardColumn = {
  status: TwigStatus;
  label: string;
  twigs: Twig[];
};

/** Droppable ids have to be distinct from twig ids, which are UUIDs. */
const COLUMN_ID_PREFIX = "column:";

export function columnId(status: TwigStatus) {
  return `${COLUMN_ID_PREFIX}${status}`;
}

export function statusFromColumnId(id: string): TwigStatus | null {
  if (!id.startsWith(COLUMN_ID_PREFIX)) {
    return null;
  }

  const status = id.slice(COLUMN_ID_PREFIX.length);

  return TWIG_STATUSES.find((candidate) => candidate === status) ?? null;
}

/** One column per status, each in board order. Undated tasks belong here too. */
export function buildBoardColumns(twigs: Twig[]): BoardColumn[] {
  return TWIG_STATUSES.map((status) => ({
    status,
    label: TWIG_STATUS_LABELS[status],
    twigs: twigs.filter((twig) => twig.status === status).sort(compareTwigsByBoardOrder),
  }));
}

export type BoardDrop = {
  twigId: string;
  status: TwigStatus;
  /** Index in the target column with the dragged card taken out, which is what the store wants. */
  targetIndex: number;
};

/**
 * Turns "card X was dropped on Y" into the move to store. `overId` is either a column, when
 * the card landed on empty space, or another card.
 *
 * Dropping onto a card puts the dragged one where that card is. Measuring the target by the
 * over card's index in the *full* column and then inserting into the column with the dragged
 * card removed is what makes that come out right in both directions: dragging down lands
 * after the card it was dropped on, dragging up lands before it.
 */
export function resolveBoardDrop({
  columns,
  activeId,
  overId,
}: {
  columns: BoardColumn[];
  activeId: string;
  overId: string | null;
}): BoardDrop | null {
  if (!overId || overId === activeId) {
    return null;
  }

  const droppedOnColumn = statusFromColumnId(overId);

  if (droppedOnColumn) {
    const column = columns.find((candidate) => candidate.status === droppedOnColumn);

    return {
      twigId: activeId,
      status: droppedOnColumn,
      targetIndex: (column?.twigs ?? []).filter((twig) => twig.id !== activeId).length,
    };
  }

  const targetColumn = columns.find((column) => column.twigs.some((twig) => twig.id === overId));

  if (!targetColumn) {
    return null;
  }

  return {
    twigId: activeId,
    status: targetColumn.status,
    targetIndex: targetColumn.twigs.findIndex((twig) => twig.id === overId),
  };
}

/**
 * Applies a move to the columns in memory, so the card is where it was dropped on the very
 * next render instead of after the write comes back.
 */
export function applyBoardDrop(columns: BoardColumn[], drop: BoardDrop): BoardColumn[] {
  const moving = columns.flatMap((column) => column.twigs).find((twig) => twig.id === drop.twigId);

  if (!moving) {
    return columns;
  }

  return columns.map((column) => {
    const without = column.twigs.filter((twig) => twig.id !== drop.twigId);

    if (column.status !== drop.status) {
      return { ...column, twigs: without };
    }

    const next = [...without];
    next.splice(Math.max(0, Math.min(drop.targetIndex, next.length)), 0, {
      ...moving,
      status: drop.status,
    });

    return { ...column, twigs: next };
  });
}
