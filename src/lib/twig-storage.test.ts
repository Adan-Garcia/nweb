import { beforeEach, describe, expect, it } from "vitest";

import { BRANCH_ID, makeTwig } from "@/test/workspace-fixtures";

import { getNotesDb } from "./notes-db";
import { BOARD_ORDER_STEP, compareTwigsByDue } from "./twig-model";
import {
  createTwig,
  listTwigs,
  moveTwig,
  resolveBoardOrder,
  softDeleteTwig,
  updateTwig,
} from "./twig-storage";

beforeEach(async () => {
  const database = await getNotesDb();
  await database.clear("twigs");
});

describe("twig storage", () => {
  it("creates a task with the defaults a quick capture needs", async () => {
    const twig = await createTwig({ branchId: BRANCH_ID, title: "Lab report" });

    expect(twig).toMatchObject({
      branchId: BRANCH_ID,
      title: "Lab report",
      kind: "homework",
      dueDate: null,
      dueTime: "",
      status: "incomplete",
      nestIds: [],
      featherId: null,
      deletedAt: null,
    });
  });

  it("appends each new task to the end of its own column", async () => {
    const first = await createTwig({ branchId: BRANCH_ID, title: "One" });
    const second = await createTwig({ branchId: BRANCH_ID, title: "Two" });
    const started = await createTwig({
      branchId: BRANCH_ID,
      title: "Three",
      status: "inprogress",
    });

    expect(first.boardOrder).toBe(0);
    expect(second.boardOrder).toBe(BOARD_ORDER_STEP);
    // A different column starts again from the beginning.
    expect(started.boardOrder).toBe(0);
  });

  it("updates a task and tombstones it, hiding it from the listing", async () => {
    const twig = await createTwig({ branchId: BRANCH_ID, title: "Essay" });

    expect(await updateTwig(twig.id, { status: "complete" })).toMatchObject({
      status: "complete",
    });
    expect(await softDeleteTwig(twig.id)).toBe(true);
    expect(await listTwigs()).toEqual([]);

    const database = await getNotesDb();
    expect((await database.get("twigs", twig.id))?.deletedAt).toEqual(expect.any(Number));
  });

  it("reports nothing to do for an unknown id or a task already deleted", async () => {
    const twig = await createTwig({ branchId: BRANCH_ID, title: "Essay" });

    expect(await updateTwig("missing", { title: "X" })).toBeNull();
    expect(await softDeleteTwig("missing")).toBe(false);
    expect(await softDeleteTwig(twig.id)).toBe(true);
    expect(await softDeleteTwig(twig.id)).toBe(false);
    expect(await updateTwig(twig.id, { title: "X" })).toBeNull();
  });
});

describe("compareTwigsByDue", () => {
  it("sorts by date, then title, and leaves undated tasks last", () => {
    const sorted = [
      makeTwig({ id: "c", title: "Zeta", dueDate: null }),
      makeTwig({ id: "a", title: "Beta", dueDate: "2026-04-18" }),
      makeTwig({ id: "b", title: "Alpha", dueDate: "2026-04-18" }),
      makeTwig({ id: "d", title: "Early", dueDate: "2026-04-16" }),
      makeTwig({ id: "e", title: "Alpha", dueDate: null }),
    ]
      .sort(compareTwigsByDue)
      .map((twig) => twig.id);

    expect(sorted).toEqual(["d", "b", "a", "e", "c"]);
  });
});

describe("resolveBoardOrder", () => {
  const column = [makeTwig({ id: "a", boardOrder: 0 }), makeTwig({ id: "b", boardOrder: 1000 })];

  it("lands halfway between the two rows a drop fell between", () => {
    expect(resolveBoardOrder(column, 1)).toBe(500);
  });

  it("steps clear of the end it was dropped on", () => {
    expect(resolveBoardOrder(column, 0)).toBe(-BOARD_ORDER_STEP);
    expect(resolveBoardOrder(column, 2)).toBe(1000 + BOARD_ORDER_STEP);
    expect(resolveBoardOrder([], 0)).toBe(0);
  });

  it("asks for a renumber once the neighbours have no room between them", () => {
    const tight = [makeTwig({ id: "a", boardOrder: 4 }), makeTwig({ id: "b", boardOrder: 5 })];

    expect(resolveBoardOrder(tight, 1)).toBe("renumber");
  });
});

describe("moveTwig", () => {
  it("rewrites one row for an ordinary move", async () => {
    await createTwig({ branchId: BRANCH_ID, title: "One" });
    await createTwig({ branchId: BRANCH_ID, title: "Two" });
    const moving = await createTwig({ branchId: BRANCH_ID, title: "Three" });

    const changed = await moveTwig({ twigId: moving.id, status: "incomplete", targetIndex: 1 });

    expect(changed).toHaveLength(1);
    expect((await listTwigs()).map((twig) => twig.title)).toEqual(["One", "Three", "Two"]);
  });

  it("carries a task into another column", async () => {
    const moving = await createTwig({ branchId: BRANCH_ID, title: "One" });

    const changed = await moveTwig({ twigId: moving.id, status: "complete", targetIndex: 0 });

    expect(changed[0]).toMatchObject({ status: "complete" });
    expect((await listTwigs())[0].status).toBe("complete");
  });

  it("spreads the column back out when the gap has run out", async () => {
    const database = await getNotesDb();
    const first = await createTwig({ branchId: BRANCH_ID, title: "One" });
    const second = await createTwig({ branchId: BRANCH_ID, title: "Two" });
    const moving = await createTwig({ branchId: BRANCH_ID, title: "Three" });

    // Squeeze the two rows together, the state ~50 drops into the same gap would reach.
    await database.put("twigs", { ...first, boardOrder: 4 });
    await database.put("twigs", { ...second, boardOrder: 5 });

    const changed = await moveTwig({ twigId: moving.id, status: "incomplete", targetIndex: 1 });

    expect(changed).toHaveLength(3);
    expect(changed.map((twig) => twig.boardOrder)).toEqual([0, BOARD_ORDER_STEP, 2000]);
    expect((await listTwigs()).map((twig) => twig.title)).toEqual(["One", "Three", "Two"]);
  });

  it("clamps an index past the end and ignores a task that is not there", async () => {
    const moving = await createTwig({ branchId: BRANCH_ID, title: "One" });

    expect(await moveTwig({ twigId: "missing", status: "incomplete", targetIndex: 0 })).toEqual([]);
    expect(
      await moveTwig({ twigId: moving.id, status: "incomplete", targetIndex: 99 }),
    ).toHaveLength(1);
  });
});
