import { describe, expect, it } from "vitest";

import {
  BRANCH_ID,
  FLIGHT_ID,
  makeBranch,
  makeEntry,
  makeFlight,
  makeNest,
  makeSnapshot,
  makeWing,
  NEST_ID,
  WING_ID,
} from "@/test/workspace-fixtures";

import {
  branchesForFlight,
  branchPath,
  displayLocation,
  emptyWorkspaceSnapshot,
  entriesForNest,
  flightsForWing,
  formatLocationPath,
  nestsForBranch,
  SHARED_SEGMENT_LABEL,
  sharedBranches,
  UNFILED_NEST_LABEL,
} from "./workspace-tree";

describe("walking the tree", () => {
  it("lists a wing's flights newest term first", () => {
    const snapshot = makeSnapshot({
      flights: [
        makeFlight({ id: "f1", name: "Spring 2026", term: "Spring", year: 2026 }),
        makeFlight({ id: "f2", name: "Fall 2026", term: "Fall", year: 2026 }),
        makeFlight({ id: "f3", wingId: "other-wing", name: "Fall 2027" }),
      ],
    });

    expect(flightsForWing(snapshot, WING_ID).map((flight) => flight.name)).toEqual([
      "Fall 2026",
      "Spring 2026",
    ]);
  });

  it("lists branches and nests by name", () => {
    const snapshot = makeSnapshot({
      branches: [
        makeBranch({ id: "b1", name: "Zoology" }),
        makeBranch({ id: "b2", name: "Art" }),
        makeBranch({ id: "b3", flightId: "other-flight", name: "Chemistry" }),
      ],
      nests: [
        makeNest({ id: "n1", branchId: "b1", name: "Unit 2" }),
        makeNest({ id: "n2", branchId: "b1", name: "Unit 1" }),
      ],
    });

    expect(branchesForFlight(snapshot, FLIGHT_ID).map((branch) => branch.name)).toEqual([
      "Art",
      "Zoology",
    ]);
    expect(nestsForBranch(snapshot, "b1").map((nest) => nest.name)).toEqual(["Unit 1", "Unit 2"]);
  });

  it("walks up from a branch to its flight and wing", () => {
    expect(branchPath(makeSnapshot(), BRANCH_ID)).toMatchObject({
      wing: { id: WING_ID },
      flight: { id: FLIGHT_ID },
      branch: { id: BRANCH_ID },
    });
  });

  it("keeps the course's own name when the levels above it cannot be read", () => {
    // A course shared with you arrives without its term and wing, because those are names
    // under keys you were not given. Dropping the course's name with them would lose the
    // one thing that is readable.
    expect(branchPath(makeSnapshot({ flights: [] }), BRANCH_ID)).toMatchObject({
      branch: { id: BRANCH_ID },
      flight: null,
      wing: null,
      isShared: true,
    });
    expect(branchPath(makeSnapshot({ wings: [] }), BRANCH_ID)).toMatchObject({
      branch: { id: BRANCH_ID },
      wing: null,
      isShared: true,
    });
  });

  it("returns null only when the branch itself is not there", () => {
    expect(branchPath(makeSnapshot(), "no-such-branch")).toBeNull();
    expect(branchPath(emptyWorkspaceSnapshot(), null)).toBeNull();
  });

  it("is not shared when the whole path resolves", () => {
    expect(branchPath(makeSnapshot(), BRANCH_ID)?.isShared).toBe(false);
  });
});

describe("sharedBranches", () => {
  it("is empty in a workspace where every course has a term", () => {
    expect(sharedBranches(makeSnapshot())).toEqual([]);
  });

  it("lists the courses whose term cannot be read, by name", () => {
    const snapshot = makeSnapshot({
      branches: [
        makeBranch({ id: "b1", name: "Zoology", flightId: "a-term-not-here" }),
        makeBranch({ id: "b2", name: "Art", flightId: "a-term-not-here" }),
        makeBranch({ id: "b3", name: "Mine", flightId: FLIGHT_ID }),
      ],
    });

    expect(sharedBranches(snapshot).map((branch) => branch.name)).toEqual(["Art", "Zoology"]);
  });

  it("is where the course dropdown looks when no term is chosen", () => {
    const snapshot = makeSnapshot({
      branches: [makeBranch({ id: "b1", name: "Shared", flightId: "a-term-not-here" })],
    });

    // Not a gap a shared course falls through: precisely the place it belongs.
    expect(branchesForFlight(snapshot, null).map((branch) => branch.name)).toEqual(["Shared"]);
  });
});

describe("a course shared with you", () => {
  /** What a recipient's workspace holds: the course and its note, and nothing above them. */
  const sharedSnapshot = () => makeSnapshot({ wings: [], flights: [] });

  it("still shows its own name, and says where the rest went", () => {
    expect(displayLocation(sharedSnapshot(), makeEntry())).toEqual({
      wing: SHARED_SEGMENT_LABEL,
      flight: "",
      branch: "Biology 101",
      nest: "Unit 1",
      feather: "Exam review",
    });
  });

  it("reads as one path rather than saying it twice", () => {
    const location = displayLocation(sharedSnapshot(), makeEntry());

    // The term is left blank on purpose: both segments are joined into one string, and
    // repeating the label would read as though it meant two different things.
    expect(formatLocationPath(location)).toBe(
      "Shared with you / Biology 101 / Unit 1 / Exam review",
    );
  });

  it("leaves a course with a term alone", () => {
    expect(displayLocation(makeSnapshot(), makeEntry())).toMatchObject({
      wing: "My Wing",
      flight: "Fall 2026",
    });
  });

  it("does not claim a note with no course at all is shared", () => {
    // Nothing is known about it, and "shared with you" would be a guess.
    expect(displayLocation(emptyWorkspaceSnapshot(), makeEntry())).toMatchObject({
      wing: "",
      flight: "",
      branch: "",
      feather: "Exam review",
    });
  });
});

describe("displayLocation", () => {
  it("reads every name off the entities, so a rename shows up everywhere", () => {
    const snapshot = makeSnapshot({ wings: [makeWing({ name: "Renamed Wing" })] });

    expect(displayLocation(snapshot, makeEntry())).toEqual({
      wing: "Renamed Wing",
      flight: "Fall 2026",
      branch: "Biology 101",
      nest: "Unit 1",
      feather: "Exam review",
    });
  });

  it("shows the nest the note was reached through when it carries several", () => {
    const snapshot = makeSnapshot({
      nests: [makeNest({ id: "n1", name: "Unit 1" }), makeNest({ id: "n2", name: "Unit 2" })],
    });
    const entry = makeEntry({ nestIds: ["n1", "n2"] });

    expect(displayLocation(snapshot, entry, "n2").nest).toBe("Unit 2");
    // Without one, the first by name wins, so the label is stable between renders.
    expect(displayLocation(snapshot, entry).nest).toBe("Unit 1");
    // A nest that is not on this note is ignored rather than shown.
    expect(displayLocation(snapshot, entry, "n9").nest).toBe("Unit 1");
  });

  it("calls a note with no tag Unfiled", () => {
    expect(displayLocation(makeSnapshot(), makeEntry({ nestIds: [] })).nest).toBe(
      UNFILED_NEST_LABEL,
    );
  });

  it("leaves the path blank rather than inventing names for a deleted branch", () => {
    expect(displayLocation(emptyWorkspaceSnapshot(), makeEntry())).toMatchObject({
      wing: "",
      flight: "",
      branch: "",
      feather: "Exam review",
    });
  });
});

describe("entriesForNest", () => {
  const tagged = makeEntry({ id: "both", nestIds: [NEST_ID, "nest-2"], feather: "Shared" });
  const single = makeEntry({ id: "one", nestIds: [NEST_ID], feather: "Alone" });
  const untagged = makeEntry({ id: "none", nestIds: [], feather: "Loose" });
  const elsewhere = makeEntry({ id: "away", branchId: "branch-2", nestIds: [NEST_ID] });
  const entries = [tagged, single, untagged, elsewhere];

  it("lists a note under every nest it carries", () => {
    expect(entriesForNest(entries, BRANCH_ID, NEST_ID).map((entry) => entry.id)).toEqual([
      "one",
      "both",
    ]);
    expect(entriesForNest(entries, BRANCH_ID, "nest-2").map((entry) => entry.id)).toEqual(["both"]);
  });

  it("puts the notes carrying no tag in their own group", () => {
    expect(entriesForNest(entries, BRANCH_ID, null).map((entry) => entry.id)).toEqual(["none"]);
  });

  it("never crosses a branch boundary", () => {
    expect(entriesForNest(entries, "branch-2", NEST_ID).map((entry) => entry.id)).toEqual(["away"]);
  });
});

describe("formatLocationPath", () => {
  it("joins the segments and skips the ones with nothing in them", () => {
    expect(formatLocationPath(displayLocation(makeSnapshot(), makeEntry()))).toBe(
      "My Wing / Fall 2026 / Biology 101 / Unit 1 / Exam review",
    );
    expect(formatLocationPath(displayLocation(emptyWorkspaceSnapshot(), makeEntry()))).toBe(
      "Unfiled / Exam review",
    );
  });
});
