import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";
import { BRANCH_ID, makeTwig } from "@/test/workspace-fixtures";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, createWing } from "../hierarchy/entity-storage";
import { ReadOnlyError } from "../keys/access";
import { createObjectKey } from "../keys/key-graph";
import { forgetKeyring, holdKeyring } from "../keys/object-keys";
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

describe("the machine-readable half of a due time", () => {
  it("is parsed from what the user typed", async () => {
    const twig = await createTwig({ branchId: "branch-1", title: "Essay", dueTime: "3:30 PM" });

    expect(twig.dueMinutes).toBe(15 * 60 + 30);
    expect(twig.timeZone).toBe("America/New_York");
  });

  it("is null when there was nothing to parse, rather than a guess", async () => {
    const twig = await createTwig({
      branchId: "branch-1",
      title: "Essay",
      dueTime: "after lunch",
    });

    expect(twig.dueMinutes).toBeNull();
    // The text is kept: it is what the person wrote and what the calendar shows.
    expect(twig.dueTime).toBe("after lunch");
  });

  it("is re-derived whenever the text it comes from moves", async () => {
    const twig = await createTwig({ branchId: "branch-1", title: "Essay", dueTime: "9:00 AM" });

    const moved = await updateTwig(twig.id, { dueTime: "11:45 PM" });

    expect(moved?.dueMinutes).toBe(23 * 60 + 45);
  });

  it("is left alone by a change that is not about the time", async () => {
    const twig = await createTwig({ branchId: "branch-1", title: "Essay", dueTime: "9:00 AM" });

    const moved = await updateTwig(twig.id, { status: "complete" });

    expect(moved?.dueMinutes).toBe(9 * 60);
  });

  it("fills itself in for a row written before it existed", async () => {
    const database = await getNotesDb();
    const twig = await createTwig({ branchId: "branch-1", title: "Essay", dueTime: "3:30 PM" });

    // The shape a row written by an earlier version has: text, and nothing parsed.
    const stored = await database.get("twigs", twig.id);
    await database.put("twigs", { ...stored!, dueMinutes: null, timeZone: "" });

    const [listed] = await listTwigs();
    expect(listed.dueMinutes).toBe(15 * 60 + 30);
  });
});

describe("a task shared to read", () => {
  /** A twig stamped with a key this account holds only as a reader. */
  async function theirTwig() {
    const twig = await createTwig({ branchId: BRANCH_ID, title: "Theirs" });
    const database = await getNotesDb();
    const stored = await database.get("twigs", twig.id);

    await database.put("twigs", { ...stored!, keyId: "their-key" });

    return twig;
  }

  it("cannot be changed, moved on the board, or deleted here", async () => {
    const twig = await theirTwig();
    const undo = sharedToRead("their-key");

    try {
      expect(await updateTwig(twig.id, { title: "Mine now" })).toBeNull();
      expect(await moveTwig({ twigId: twig.id, status: "complete", targetIndex: 0 })).toEqual([]);
      expect(await softDeleteTwig(twig.id)).toBe(false);
      expect((await listTwigs())[0]).toMatchObject({ title: "Theirs", status: "incomplete" });
    } finally {
      undo();
    }
  });

  it("keeps its place when the column around it is renumbered", async () => {
    const theirs = await theirTwig();
    const mine = await createTwig({ branchId: BRANCH_ID, title: "Mine" });
    const database = await getNotesDb();

    // Two rows one apart leave no room between them, so the drop renumbers the column.
    await database.put("twigs", { ...(await database.get("twigs", theirs.id))!, boardOrder: 0 });
    await database.put("twigs", { ...(await database.get("twigs", mine.id))!, boardOrder: 1 });

    const other = await createTwig({ branchId: BRANCH_ID, title: "Dropped", status: "complete" });
    const undo = sharedToRead("their-key");

    try {
      const changed = await moveTwig({ twigId: other.id, status: "incomplete", targetIndex: 1 });

      expect(changed.map((twig) => twig.id)).not.toContain(theirs.id);
      expect((await database.get("twigs", theirs.id))?.boardOrder).toBe(0);
    } finally {
      undo();
    }
  });

  it("takes no new task filed inside it", async () => {
    const database = await getNotesDb();

    await database.put("branches", {
      id: "their-course",
      flightId: "f",
      name: "Theirs",
      color: "emerald",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      keyId: "their-key",
    });
    const undo = sharedToRead("their-key");

    try {
      await expect(createTwig({ branchId: "their-course", title: "Sneaky" })).rejects.toThrow(
        ReadOnlyError,
      );
      expect(await listTwigs()).toEqual([]);
    } finally {
      undo();
      await database.delete("branches", "their-course");
    }
  });

  it("cannot take a task of this device's moved into it", async () => {
    const database = await getNotesDb();
    const mine = await createTwig({ branchId: BRANCH_ID, title: "Mine" });

    await database.put("branches", {
      id: "their-course",
      flightId: "f",
      name: "Theirs",
      color: "emerald",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      keyId: "their-key",
    });
    const undo = sharedToRead("their-key");

    try {
      expect(await updateTwig(mine.id, { branchId: "their-course" })).toBeNull();
    } finally {
      undo();
      await database.delete("branches", "their-course");
    }
  });
});

describe("moving a task on the board", () => {
  it("re-seals its title under the task's own key, not the workspace's", async () => {
    const wing = await createObjectKey("wing");

    setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
    holdKeyring(new Map([[wing.keyId, wing.key]]), { keys: [], wraps: [], grants: [] });

    try {
      const flight = await createFlight({ wingId: (await createWing("W")).id, name: "Fall 2026" });
      const branch = await createBranch({ flightId: flight.id, name: "Course" });
      const twig = await createTwig({ branchId: branch.id, title: "Problem set" });
      const database = await getNotesDb();
      const ownKey = (await database.get("twigs", twig.id))?.keyId;

      expect(ownKey).not.toBe(wing.keyId);

      await moveTwig({ twigId: twig.id, status: "complete", targetIndex: 0 });

      // Under the workspace key, a writer moving somebody's shared task would re-seal it
      // under a key its owner does not have.
      expect((await database.get("twigs", twig.id))?.keyId).toBe(ownKey);
      expect((await listTwigs())[0]?.title).toBe("Problem set");
    } finally {
      forgetKeyring();
      resetActiveCipher();
      const database = await getNotesDb();

      await Promise.all(
        (["wings", "flights", "branches"] as const).map((store) => database.clear(store)),
      );
    }
  });
});
