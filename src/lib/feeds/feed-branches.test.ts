import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";

import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, listBranches } from "../hierarchy/entity-storage";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { resolveFeedBranches } from "./feed-branches";
import type { FeedItem } from "./feed-rules";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    key: "k",
    title: "Quiz",
    dueDate: "2026-10-01",
    dueMinutes: null,
    timeZone: "UTC",
    kind: "other",
    branchId: null,
    branchName: null,
    ...overrides,
  };
}

beforeEach(async () => {
  const database = await getNotesDb();

  await Promise.all(
    (["wings", "flights", "branches"] as const).map((store) => database.clear(store)),
  );
});

describe("resolveFeedBranches", () => {
  it("files into the feed's course, or the workspace's first when it has none", async () => {
    const { path } = await ensureDefaultWorkspace();
    const course = await createBranch({ flightId: path.flight.id, name: "Physics" });

    expect((await resolveFeedBranches([], { branchId: course.id }))(item())).toBe(course.id);
    expect((await resolveFeedBranches([], { branchId: null }))(item())).toBe(path.branch.id);
    expect((await resolveFeedBranches([], { branchId: "gone" }))(item())).toBe(path.branch.id);
  });

  it("honours a course a rule named, when it is this workspace's to file under", async () => {
    const { path } = await ensureDefaultWorkspace();
    const course = await createBranch({ flightId: path.flight.id, name: "Physics" });
    const branchFor = await resolveFeedBranches([], { branchId: null });

    expect(branchFor(item({ branchId: course.id }))).toBe(course.id);
    expect(branchFor(item({ branchId: "not-a-course" }))).toBe(path.branch.id);
  });

  it("finds a course by name without regard to case, and creates one that is new", async () => {
    const { path } = await ensureDefaultWorkspace();
    const physics = await createBranch({ flightId: path.flight.id, name: "MECE 102 Mechanics" });
    const items = [
      item({ branchName: "mece 102 mechanics" }),
      item({ branchName: "  MATH 182 Calculus II " }),
      item({ branchName: "math 182 calculus ii" }),
    ];
    const branchFor = await resolveFeedBranches(items, { branchId: null });
    const created = (await listBranches()).find((branch) => branch.name === "MATH 182 Calculus II");

    expect(branchFor(items[0])).toBe(physics.id);
    expect(created?.flightId).toBe(path.flight.id);
    expect(branchFor(items[1])).toBe(created?.id);
    expect(branchFor(items[2])).toBe(created?.id);
    expect((await listBranches()).filter((branch) => branch.name.startsWith("MATH"))).toHaveLength(
      1,
    );
  });

  it("prefers the course in the feed's own term when two share a name", async () => {
    const { path } = await ensureDefaultWorkspace();
    const older = await createFlight({ wingId: path.wing.id, name: "Spring 2020" });
    await createBranch({ flightId: older.id, name: "Lab" });
    const current = await createBranch({ flightId: path.flight.id, name: "Lab" });

    const branchFor = await resolveFeedBranches([], { branchId: null });

    expect(branchFor(item({ branchName: "lab" }))).toBe(current.id);
  });

  it("does not file into a course shared to read, even by name", async () => {
    const { path } = await ensureDefaultWorkspace();
    const database = await getNotesDb();

    await database.put("branches", {
      id: "theirs",
      flightId: path.flight.id,
      name: "Theirs",
      color: "emerald",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      keyId: "their-key",
    });
    const undo = sharedToRead("their-key");

    try {
      const branchFor = await resolveFeedBranches([item({ branchName: "Theirs" })], {
        branchId: "theirs",
      });

      expect(branchFor(item({ branchId: "theirs" }))).toBe(path.branch.id);
      expect(branchFor(item({ branchName: "Theirs" }))).not.toBe("theirs");
    } finally {
      undo();
    }
  });
});
