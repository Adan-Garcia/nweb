import { describe, expect, it } from "vitest";

import { makeTwig } from "@/test/workspace-fixtures";

import {
  applyBoardDrop,
  buildBoardColumns,
  columnId,
  resolveBoardDrop,
  statusFromColumnId,
} from "./board";
import { BOARD_ORDER_STEP } from "./twig-model";

const twig = (id: string, status: "incomplete" | "inprogress" | "complete", order: number) =>
  makeTwig({ id, title: id.toUpperCase(), status, boardOrder: order });

/** Todo holds A, B, C in board order; Started holds D; Done is empty. */
const twigs = [
  twig("c", "incomplete", 2 * BOARD_ORDER_STEP),
  twig("a", "incomplete", 0),
  twig("b", "incomplete", BOARD_ORDER_STEP),
  twig("d", "inprogress", 0),
];

const columns = buildBoardColumns(twigs);

describe("buildBoardColumns", () => {
  it("makes one column per status, each in board order", () => {
    expect(columns.map((column) => [column.status, column.label])).toEqual([
      ["incomplete", "Todo"],
      ["inprogress", "Started"],
      ["complete", "Done"],
    ]);
    expect(columns[0].twigs.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(columns[1].twigs.map((item) => item.id)).toEqual(["d"]);
    expect(columns[2].twigs).toEqual([]);
  });

  it("keeps undated tasks, because a board is not a calendar", () => {
    const board = buildBoardColumns([makeTwig({ id: "someday", dueDate: null })]);

    expect(board[0].twigs.map((item) => item.id)).toEqual(["someday"]);
  });
});

describe("column ids", () => {
  it("round-trips a status, and refuses anything else", () => {
    expect(statusFromColumnId(columnId("inprogress"))).toBe("inprogress");
    expect(statusFromColumnId("some-uuid")).toBeNull();
    expect(statusFromColumnId("column:nonsense")).toBeNull();
  });
});

describe("resolveBoardDrop", () => {
  const drop = (activeId: string, overId: string | null) =>
    resolveBoardDrop({ columns, activeId, overId });

  it("ignores a drop on nothing, or on the card itself", () => {
    expect(drop("a", null)).toBeNull();
    expect(drop("a", "a")).toBeNull();
    expect(drop("a", "no-such-card")).toBeNull();
  });

  it("drops onto a column's empty space, landing at the end of it", () => {
    expect(drop("a", columnId("complete"))).toEqual({
      twigId: "a",
      status: "complete",
      targetIndex: 0,
    });
    // Back into its own column: the card itself does not count towards the end.
    expect(drop("a", columnId("incomplete"))).toEqual({
      twigId: "a",
      status: "incomplete",
      targetIndex: 2,
    });
  });

  it("dragging down lands after the card it was dropped on", () => {
    // A over C, in [a, b, c].
    const resolved = drop("a", "c");
    expect(resolved).toEqual({ twigId: "a", status: "incomplete", targetIndex: 2 });

    expect(applyBoardDrop(columns, resolved!)[0].twigs.map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("dragging up lands before the card it was dropped on", () => {
    const resolved = drop("c", "a");
    expect(resolved).toEqual({ twigId: "c", status: "incomplete", targetIndex: 0 });

    expect(applyBoardDrop(columns, resolved!)[0].twigs.map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("swaps two neighbours cleanly in both directions", () => {
    expect(applyBoardDrop(columns, drop("a", "b")!)[0].twigs.map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(applyBoardDrop(columns, drop("b", "a")!)[0].twigs.map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("drops onto a card in another column, taking that card's place", () => {
    const resolved = drop("a", "d");
    expect(resolved).toEqual({ twigId: "a", status: "inprogress", targetIndex: 0 });

    const next = applyBoardDrop(columns, resolved!);
    expect(next[0].twigs.map((item) => item.id)).toEqual(["b", "c"]);
    expect(next[1].twigs.map((item) => item.id)).toEqual(["a", "d"]);
    // The card carries its new status with it, so it renders in place immediately.
    expect(next[1].twigs[0].status).toBe("inprogress");
  });
});

describe("applyBoardDrop", () => {
  it("leaves the board alone when the card is not on it", () => {
    expect(applyBoardDrop(columns, { twigId: "missing", status: "complete", targetIndex: 0 })).toBe(
      columns,
    );
  });

  it("clamps an index past either end rather than leaving a hole", () => {
    const high = applyBoardDrop(columns, { twigId: "d", status: "incomplete", targetIndex: 99 });
    const low = applyBoardDrop(columns, { twigId: "d", status: "incomplete", targetIndex: -5 });

    expect(high[0].twigs.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(low[0].twigs.map((item) => item.id)).toEqual(["d", "a", "b", "c"]);
  });
});
