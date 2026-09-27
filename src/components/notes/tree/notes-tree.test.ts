import { describe, expect, it } from "vitest";

import {
  BRANCH_ID,
  makeBranch,
  makeEntry,
  makeFlight,
  makeNest,
  makeSnapshot,
  NEST_ID,
} from "@/test/workspace-fixtures";

import { selectionForEntry } from "../location/location-hierarchy";
import { buildTree, formatUpdatedAt, getActivePathKeys } from "./notes-tree";

describe("buildTree", () => {
  it("groups the notes under the entities they belong to", () => {
    const snapshot = makeSnapshot();
    const tree = buildTree(snapshot, [makeEntry()]);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("My Wing");
    expect(tree[0].flights[0].name).toBe("Fall 2026");
    expect(tree[0].flights[0].branches[0].name).toBe("Biology 101");
    expect(tree[0].flights[0].branches[0].nests[0]).toMatchObject({
      id: NEST_ID,
      name: "Unit 1",
    });
    expect(tree[0].flights[0].branches[0].nests[0].feathers.map((entry) => entry.id)).toEqual([
      "note-1",
    ]);
  });

  it("lists a note tagged with two nests under both of them", () => {
    const snapshot = makeSnapshot({
      nests: [makeNest({ id: "n1", name: "Unit 1" }), makeNest({ id: "n2", name: "Unit 2" })],
    });

    const [{ nests }] = buildTree(snapshot, [makeEntry({ nestIds: ["n1", "n2"] })])[0].flights[0]
      .branches;

    expect(nests.map((nest) => nest.name)).toEqual(["Unit 1", "Unit 2"]);
    expect(nests.every((nest) => nest.feathers[0].id === "note-1")).toBe(true);
  });

  it("gives the untagged notes a group of their own", () => {
    const tree = buildTree(makeSnapshot(), [makeEntry({ nestIds: [] })]);
    const [nest] = tree[0].flights[0].branches[0].nests;

    expect(nest).toMatchObject({ id: null, name: "Unfiled" });
    expect(nest.feathers).toHaveLength(1);
  });

  it("drops levels with nothing in them, so an empty flight is not in the way", () => {
    const snapshot = makeSnapshot({
      flights: [makeFlight(), makeFlight({ id: "f-empty", name: "Spring 2027" })],
      branches: [makeBranch(), makeBranch({ id: "b-empty", flightId: "f-empty", name: "Empty" })],
    });

    const tree = buildTree(snapshot, [makeEntry()]);

    expect(tree[0].flights.map((flight) => flight.name)).toEqual(["Fall 2026"]);
  });

  it("returns nothing at all when no note has been saved", () => {
    expect(buildTree(makeSnapshot(), [])).toEqual([]);
  });

  it("keys every group by its record id, so a rename does not reshuffle the tree", () => {
    const tree = buildTree(makeSnapshot(), [makeEntry()]);

    expect(tree[0].key).toBe("wing:wing-1");
    expect(tree[0].flights[0].branches[0].key).toBe(`branch:${BRANCH_ID}`);
  });
});

describe("getActivePathKeys", () => {
  it("names the groups on the way to the open note", () => {
    const selection = selectionForEntry(makeSnapshot(), makeEntry());

    expect(getActivePathKeys(selection)).toEqual([
      "wing:wing-1",
      "flight:flight-1",
      `branch:${BRANCH_ID}`,
      `nest:${NEST_ID}`,
    ]);
  });

  it("points at the Unfiled group for a note with no tag", () => {
    const selection = selectionForEntry(makeSnapshot(), makeEntry({ nestIds: [] }));

    expect(getActivePathKeys(selection).at(-1)).toBe(`nest:unfiled:${BRANCH_ID}`);
  });
});

describe("formatUpdatedAt", () => {
  it("renders a timestamp as a local date and time", () => {
    expect(formatUpdatedAt(Date.UTC(2026, 3, 16, 12))).toContain("2026");
  });
});
