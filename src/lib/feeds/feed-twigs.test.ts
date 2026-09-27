import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";

import { getNotesDb } from "../db/notes-db";
import { BOARD_ORDER_STEP } from "../twigs/twig-model";
import { createTwig, listTwigs, softDeleteTwig, updateTwig } from "../twigs/twig-storage";
import type { FeedItem } from "./feed-rules";
import { applyFeedItems, feedTwigId, removeFeedTwigs } from "./feed-twigs";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    key: "quiz",
    title: "Quiz 1",
    dueDate: "2026-10-01",
    dueMinutes: 23 * 60 + 59,
    timeZone: "America/New_York",
    kind: "exam",
    branchId: null,
    branchName: null,
    ...overrides,
  };
}

const apply = (items: FeedItem[], overrides: Partial<Parameters<typeof applyFeedItems>[0]> = {}) =>
  applyFeedItems({
    feedId: "feed-1",
    items,
    branchFor: () => "branch-1",
    cutoff: null,
    completePast: true,
    today: "2026-09-27",
    ...overrides,
  });

beforeEach(async () => {
  await (await getNotesDb()).clear("twigs");
});

describe("feedTwigId", () => {
  it("is stable, shaped like a UUID, and differs between feeds", async () => {
    const id = await feedTwigId("feed-1", "quiz");

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await feedTwigId("feed-1", "quiz")).toBe(id);
    expect(await feedTwigId("feed-2", "quiz")).not.toBe(id);
  });
});

describe("applyFeedItems", () => {
  it("brings events in as tasks after the ones already on the board", async () => {
    await createTwig({ branchId: "branch-1", title: "Typed in" });

    expect(
      await apply([
        item(),
        item({ key: "past", title: "Old quiz", dueDate: "2026-09-01", dueMinutes: null }),
      ]),
    ).toEqual({
      added: 2,
      updated: 0,
      removed: 0,
    });

    const twigs = await listTwigs();
    const quiz = twigs.find((twig) => twig.title === "Quiz 1");

    expect(quiz).toMatchObject({
      id: await feedTwigId("feed-1", "quiz"),
      branchId: "branch-1",
      kind: "exam",
      dueDate: "2026-10-01",
      dueTime: "11:59 PM",
      dueMinutes: 23 * 60 + 59,
      status: "incomplete",
      boardOrder: BOARD_ORDER_STEP,
      feedId: "feed-1",
    });
    // Already over when it arrived, so it starts as done rather than overdue.
    expect(twigs.find((twig) => twig.title === "Old quiz")).toMatchObject({
      status: "complete",
      dueTime: "",
    });
  });

  it("starts past events as to-do when asked to", async () => {
    await apply([item({ dueDate: "2026-09-01" })], { completePast: false });

    expect((await listTwigs())[0].status).toBe("incomplete");
  });

  it("changes nothing when the feed has not changed", async () => {
    await apply([item()]);

    expect(await apply([item()])).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("updates what the feed owns and keeps what the user did", async () => {
    await apply([item()]);
    const id = await feedTwigId("feed-1", "quiz");

    await updateTwig(id, { status: "inprogress" });

    expect(await apply([item({ title: "Quiz 1 (moved)", dueDate: "2026-10-02" })])).toMatchObject({
      updated: 1,
    });
    expect((await listTwigs())[0]).toMatchObject({
      title: "Quiz 1 (moved)",
      dueDate: "2026-10-02",
      status: "inprogress",
    });
  });

  it("removes a task whose event left the feed, and only that feed's", async () => {
    await apply([item(), item({ key: "dropped", title: "Dropped" })]);
    await apply([item({ key: "other" })], { feedId: "feed-2" });
    await createTwig({ branchId: "branch-1", title: "Typed in" });

    expect(await apply([item()])).toMatchObject({ removed: 1 });
    expect((await listTwigs()).map((twig) => twig.title).sort()).toEqual([
      "Quiz 1",
      "Quiz 1",
      "Typed in",
    ]);
  });

  it("does not bring back a task deleted by hand", async () => {
    await apply([item()]);
    await softDeleteTwig(await feedTwigId("feed-1", "quiz"));

    expect(await apply([item({ title: "Changed" })])).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await listTwigs()).toEqual([]);
  });

  it("neither brings in nor touches nor removes what is before the cutoff", async () => {
    await apply([item({ dueDate: "2026-09-01" })]);

    expect(
      await apply(
        [
          item({ dueDate: "2026-09-01", title: "Renamed" }),
          item({ key: "older", dueDate: "2026-08-01" }),
        ],
        {
          cutoff: "2026-09-13",
        },
      ),
    ).toEqual({ added: 0, updated: 0, removed: 0 });
    expect((await listTwigs()).map((twig) => twig.title)).toEqual(["Quiz 1"]);
  });

  it("leaves a task shared to read alone, and counts an edit the store refused as none", async () => {
    await apply([item(), item({ key: "second" })]);
    const database = await getNotesDb();

    for (const key of ["quiz", "second"]) {
      const id = await feedTwigId("feed-1", key);

      await database.put("twigs", { ...(await database.get("twigs", id))!, keyId: "their-key" });
    }

    const undo = sharedToRead("their-key");

    try {
      expect(await apply([item({ title: "Changed" })])).toEqual({
        added: 0,
        updated: 0,
        removed: 0,
      });
    } finally {
      undo();
    }
  });

  it("counts an update the twig store refused as none", async () => {
    await apply([item()]);
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
      expect(await apply([item()], { branchFor: () => "their-course" })).toMatchObject({
        updated: 0,
      });
    } finally {
      undo();
      await database.delete("branches", "their-course");
    }
  });
});

describe("removeFeedTwigs", () => {
  it("removes every task one feed brought in, and no other", async () => {
    await apply([item(), item({ key: "second" })]);
    await apply([item()], { feedId: "feed-2" });

    expect(await removeFeedTwigs("feed-1")).toBe(2);
    expect((await listTwigs()).map((twig) => twig.feedId)).toEqual(["feed-2"]);
  });
});
