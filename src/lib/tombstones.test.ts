import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "./notes-db";
import {
  collectTombstones,
  collectTombstonesOnce,
  resetTombstoneSweepForTests,
  TOMBSTONE_RETENTION_MS,
} from "./tombstones";

const NOW = Date.UTC(2026, 8, 21);
const LONG_AGO = NOW - TOMBSTONE_RETENTION_MS - 1;
const RECENTLY = NOW - TOMBSTONE_RETENTION_MS + 1;

async function seedBranch(id: string, deletedAt: number | null) {
  const database = await getNotesDb();

  await database.put("branches", {
    id,
    flightId: "flight-1",
    name: id,
    color: "emerald",
    createdAt: 1,
    updatedAt: 1,
    deletedAt,
  });
}

async function seedTwig(id: string, deletedAt: number | null) {
  const database = await getNotesDb();

  await database.put("twigs", {
    id,
    branchId: "branch-1",
    nestIds: [],
    title: id,
    kind: "homework",
    dueDate: null,
    dueTime: "",
    status: "incomplete",
    boardOrder: 0,
    featherId: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt,
  });
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("branches"),
    database.clear("twigs"),
    database.clear("notes-directory"),
  ]);
  resetTombstoneSweepForTests();
});

describe("collectTombstones", () => {
  it("removes markers past the retention window", async () => {
    await seedBranch("old", LONG_AGO);
    await seedTwig("old-twig", LONG_AGO);

    const swept = await collectTombstones(NOW);

    const database = await getNotesDb();
    expect(await database.get("branches", "old")).toBeUndefined();
    expect(await database.get("twigs", "old-twig")).toBeUndefined();
    expect(swept).toMatchObject({ branches: 1, twigs: 1 });
  });

  it("keeps a recent one, because a tombstone is meant to outlive the delete", async () => {
    await seedBranch("recent", RECENTLY);

    await collectTombstones(NOW);

    const database = await getNotesDb();
    expect(await database.get("branches", "recent")).toBeDefined();
  });

  it("never touches a live row", async () => {
    await seedBranch("alive", null);

    const swept = await collectTombstones(NOW);

    const database = await getNotesDb();
    expect(await database.get("branches", "alive")).toBeDefined();
    expect(swept.branches).toBe(0);
  });

  it("reports nothing on an empty database", async () => {
    expect(await collectTombstones(NOW)).toEqual({
      "notes-directory": 0,
      wings: 0,
      flights: 0,
      branches: 0,
      nests: 0,
      twigs: 0,
      pebbles: 0,
    });
  });
});

describe("collectTombstonesOnce", () => {
  it("sweeps once per load, however many callers ask", async () => {
    await seedBranch("old", LONG_AGO);

    const [first, second] = await Promise.all([collectTombstonesOnce(), collectTombstonesOnce()]);

    expect(first).toBe(second);
    expect(first.branches).toBe(1);
  });

  it("swallows a failure, because housekeeping is not something to interrupt anyone with", async () => {
    const database = await getNotesDb();
    vi.spyOn(database, "transaction").mockImplementationOnce(() => {
      throw new Error("store unavailable");
    });

    await expect(collectTombstonesOnce()).resolves.toMatchObject({ branches: 0 });
  });
});
