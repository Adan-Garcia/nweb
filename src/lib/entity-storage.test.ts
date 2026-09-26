import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";

import { BRANCH_COLORS } from "./entity-model";
import {
  createBranch,
  createFlight,
  createNest,
  createWing,
  listBranches,
  listFlights,
  listNests,
  listWings,
  renameBranch,
  renameFlight,
  renameNest,
  renameWing,
  setBranchColor,
} from "./entity-storage";
import { ReadOnlyError } from "./keys/access";
import { getNotesDb } from "./notes-db";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
    database.clear("nests"),
  ]);
});

describe("creating entities", () => {
  it("gives every record a uuid, timestamps and a null tombstone", async () => {
    const wing = await createWing("My Wing");

    expect(wing.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(wing.deletedAt).toBeNull();
    expect(wing.updatedAt).toBe(wing.createdAt);
  });

  it("parses a flight's term and year out of the name it was given", async () => {
    const wing = await createWing("My Wing");

    expect(await createFlight({ wingId: wing.id, name: "Fall 2026" })).toMatchObject({
      term: "Fall",
      year: 2026,
    });
    expect(await createFlight({ wingId: wing.id, name: "Block C" })).toMatchObject({
      term: null,
      year: null,
    });
  });

  it("builds a flight's name from a term and year when no name is given", async () => {
    const wing = await createWing("My Wing");

    expect(await createFlight({ wingId: wing.id, term: "Spring", year: 2027 })).toMatchObject({
      name: "Spring 2027",
      term: "Spring",
      year: 2027,
    });
  });

  it("cycles the palette so sibling branches do not all come out one colour", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });

    const first = await createBranch({ flightId: flight.id, name: "Biology" });
    const second = await createBranch({ flightId: flight.id, name: "History" });

    expect(first.color).toBe(BRANCH_COLORS[0]);
    expect(second.color).toBe(BRANCH_COLORS[1]);
  });

  it("honours an explicit branch colour", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });

    expect(await createBranch({ flightId: flight.id, name: "Art", color: "rose" })).toMatchObject({
      color: "rose",
    });
  });

  it("lists only what has not been tombstoned", async () => {
    const database = await getNotesDb();
    const wing = await createWing("Kept");
    const doomed = await createWing("Gone");
    await database.put("wings", { ...doomed, deletedAt: 5 });

    expect((await listWings()).map((row) => row.id)).toEqual([wing.id]);
  });
});

describe("renaming entities", () => {
  it("renames in one row, leaving the id alone so nothing that points at it breaks", async () => {
    const wing = await createWing("Old Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Biology" });
    const nest = await createNest({ branchId: branch.id, name: "Unit 1" });

    await renameWing(wing.id, "New Wing");
    await renameBranch(branch.id, "Biology 101");
    await renameNest(nest.id, "Unit One");

    expect((await listWings())[0]).toMatchObject({ id: wing.id, name: "New Wing" });
    expect((await listBranches())[0]).toMatchObject({ id: branch.id, name: "Biology 101" });
    expect((await listNests())[0]).toMatchObject({ id: nest.id, name: "Unit One" });
  });

  it("re-reads a flight's term and year when it is renamed", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Block C" });

    await renameFlight(flight.id, "Spring 2027");

    expect((await listFlights())[0]).toMatchObject({
      id: flight.id,
      name: "Spring 2027",
      term: "Spring",
      year: 2027,
    });
  });

  it("changes a branch's colour", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Art" });

    expect(await setBranchColor(branch.id, "indigo")).toMatchObject({ color: "indigo" });
  });

  it("reports nothing to rename for an id that is not there", async () => {
    expect(await renameWing("missing", "X")).toBeNull();
    expect(await renameFlight("missing", "X")).toBeNull();
    expect(await renameBranch("missing", "X")).toBeNull();
    expect(await renameNest("missing", "X")).toBeNull();
    expect(await setBranchColor("missing", "rose")).toBeNull();
  });
});

describe("a course or tag shared to read", () => {
  it("cannot be renamed or recoloured here, and takes nothing new under it", async () => {
    const database = await getNotesDb();
    const wing = await createWing("Theirs");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Their course" });
    const nest = await createNest({ branchId: branch.id, name: "Their tag" });

    for (const [store, id] of [
      ["wings", wing.id],
      ["flights", flight.id],
      ["branches", branch.id],
      ["nests", nest.id],
    ] as const) {
      const row = await database.get(store, id);

      await database.put(store, { ...row!, keyId: "their-key" });
    }

    const undo = sharedToRead("their-key");

    try {
      expect(await renameWing(wing.id, "Mine")).toBeNull();
      expect(await renameFlight(flight.id, "Spring 2027")).toBeNull();
      expect(await renameBranch(branch.id, "Mine")).toBeNull();
      expect(await setBranchColor(branch.id, "rose")).toBeNull();
      expect(await renameNest(nest.id, "Mine")).toBeNull();

      await expect(createFlight({ wingId: wing.id, name: "Summer 2027" })).rejects.toThrow(
        ReadOnlyError,
      );
      await expect(createBranch({ flightId: flight.id, name: "New" })).rejects.toThrow(
        ReadOnlyError,
      );
      await expect(createNest({ branchId: branch.id, name: "New" })).rejects.toThrow(ReadOnlyError);
    } finally {
      undo();
    }
  });
});
