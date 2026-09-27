import { describe, expect, it } from "vitest";

import {
  BRANCH_ID,
  FLIGHT_ID,
  makeBranch,
  makeEntry,
  makeFlight,
  makeNest,
  makeSnapshot,
  NEST_ID,
  WING_ID,
} from "@/test/workspace-fixtures";

import {
  EMPTY_SELECTION,
  formatSelectionSummary,
  resolveCascade,
  segmentLabels,
  segmentOptions,
  selectionForEntry,
  type WorkspaceSelection,
} from "./location-hierarchy";

const snapshot = makeSnapshot();
const entry = makeEntry();
const selection = selectionForEntry(snapshot, entry);

describe("selectionForEntry", () => {
  it("resolves the whole path from the branch the note points at", () => {
    expect(selection).toEqual({
      wingId: WING_ID,
      flightId: FLIGHT_ID,
      branchId: BRANCH_ID,
      nestId: NEST_ID,
      featherId: "note-1",
    });
  });

  it("prefers the nest the note was reached through when it carries several", () => {
    const tagged = makeSnapshot({
      nests: [makeNest({ id: "n1", name: "Unit 1" }), makeNest({ id: "n2", name: "Unit 2" })],
    });
    const both = makeEntry({ nestIds: ["n1", "n2"] });

    expect(selectionForEntry(tagged, both, "n2").nestId).toBe("n2");
    expect(selectionForEntry(tagged, both).nestId).toBe("n1");
    // A nest the note does not carry is ignored rather than adopted.
    expect(selectionForEntry(tagged, both, "n9").nestId).toBe("n1");
  });

  it("puts a note with no tag in the Unfiled group", () => {
    expect(selectionForEntry(snapshot, makeEntry({ nestIds: [] })).nestId).toBeNull();
  });
});

describe("segmentOptions", () => {
  it("offers only the children of what is selected above", () => {
    const wider = makeSnapshot({
      flights: [makeFlight(), makeFlight({ id: "f2", wingId: "other-wing", name: "Fall 2027" })],
      branches: [
        makeBranch(),
        makeBranch({ id: "b2", flightId: "other-flight", name: "Elsewhere" }),
      ],
    });

    const options = segmentOptions(wider, [entry], selection);

    expect(options.flight.map((option) => option.name)).toEqual(["Fall 2026"]);
    expect(options.branch.map((option) => option.name)).toEqual(["Biology 101"]);
  });

  it("always offers Unfiled, so untagged notes stay reachable", () => {
    expect(segmentOptions(snapshot, [entry], selection).nest).toEqual([
      { id: NEST_ID, name: "Unit 1" },
      { id: null, name: "Unfiled" },
    ]);
  });

  it("lists the notes carrying the selected nest", () => {
    const entries = [
      entry,
      makeEntry({ id: "other", feather: "Another", nestIds: [NEST_ID] }),
      makeEntry({ id: "loose", feather: "Loose", nestIds: [] }),
    ];

    expect(segmentOptions(snapshot, entries, selection).feather.map((o) => o.name)).toEqual([
      "Another",
      "Exam review",
    ]);
    expect(
      segmentOptions(snapshot, entries, { ...selection, nestId: null }).feather.map((o) => o.name),
    ).toEqual(["Loose"]);
  });
});

describe("segmentLabels", () => {
  it("shows the stored name for every level", () => {
    expect(segmentLabels(snapshot, [entry], selection)).toEqual({
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "Biology 101",
      nest: "Unit 1",
      feather: "Exam review",
    });
  });

  it("says what is missing rather than showing a blank dropdown", () => {
    expect(segmentLabels(snapshot, [], EMPTY_SELECTION)).toEqual({
      wing: "No wing",
      flight: "No flight",
      branch: "No branch",
      nest: "Unfiled",
      feather: "No note",
    });
  });

  it("joins the labels into the summary the create dialog shows", () => {
    expect(formatSelectionSummary(snapshot, [entry], selection)).toBe(
      "My Wing / Fall 2026 / Biology 101 / Unit 1 / Exam review",
    );
  });
});

describe("resolveCascade", () => {
  const entries = [entry];

  it("re-picks every level under the one that changed", () => {
    const wider = makeSnapshot({
      wings: [...makeSnapshot().wings, { ...makeSnapshot().wings[0], id: "w2", name: "Other" }],
      flights: [makeFlight(), makeFlight({ id: "f2", wingId: "w2", name: "Spring 2027" })],
      branches: [makeBranch(), makeBranch({ id: "b2", flightId: "f2", name: "Physics" })],
      nests: [makeNest(), makeNest({ id: "n2", branchId: "b2", name: "Week 1" })],
    });

    const next = resolveCascade(wider, entries, selection, "wing", "w2");

    expect(next).toEqual({
      wingId: "w2",
      flightId: "f2",
      branchId: "b2",
      nestId: "n2",
      featherId: null,
    });
  });

  it("leaves the levels above the one that changed alone", () => {
    const next = resolveCascade(snapshot, entries, selection, "nest", null);

    expect(next).toMatchObject({ wingId: WING_ID, flightId: FLIGHT_ID, branchId: BRANCH_ID });
    expect(next.nestId).toBeNull();
    // Nothing is filed under Unfiled here, so there is no note to land on.
    expect(next.featherId).toBeNull();
  });

  it("lands on a nest that has notes rather than the first empty one", () => {
    const withEmpty = makeSnapshot({
      nests: [
        makeNest({ id: "n-empty", name: "Aardvark" }),
        makeNest({ id: "n-full", name: "Zebra" }),
      ],
    });
    const filed = [makeEntry({ id: "filed", nestIds: ["n-full"] })];

    const next = resolveCascade(withEmpty, filed, selection, "branch", BRANCH_ID);

    expect(next.nestId).toBe("n-full");
    expect(next.featherId).toBe("filed");
  });

  it("falls back to Unfiled when only untagged notes are in the branch", () => {
    const loose = [makeEntry({ id: "loose", nestIds: [] })];

    expect(resolveCascade(snapshot, loose, selection, "branch", BRANCH_ID)).toMatchObject({
      nestId: null,
      featherId: "loose",
    });
  });

  it("selects a note without disturbing anything above it", () => {
    const next: WorkspaceSelection = resolveCascade(
      snapshot,
      entries,
      selection,
      "feather",
      "note-1",
    );

    expect(next).toEqual({ ...selection, featherId: "note-1" });
  });
});

describe("navigating to a course somebody shared", () => {
  /** A recipient's workspace: the course arrived, its term and wing did not. */
  const sharedSnapshot = () => makeSnapshot({ wings: [], flights: [] });

  it("offers the fact in place of a wing, since it sits under none of yours", () => {
    const options = segmentOptions(sharedSnapshot(), [makeEntry()], EMPTY_SELECTION);

    expect(options.wing).toEqual([{ id: null, name: "Shared with you" }]);
  });

  it("offers no such entry when nothing has been shared", () => {
    const options = segmentOptions(makeSnapshot(), [makeEntry()], EMPTY_SELECTION);

    expect(options.wing.map((option) => option.name)).not.toContain("Shared with you");
  });

  it("lists the shared course once that is chosen", () => {
    const options = segmentOptions(sharedSnapshot(), [makeEntry()], EMPTY_SELECTION);

    // Without this the course is in the database, holds a key that opens it, and cannot be
    // reached from anywhere in the app.
    expect(options.branch.map((option) => option.name)).toEqual(["Biology 101"]);
  });

  it("cascades from it all the way down to the note", () => {
    const next = resolveCascade(sharedSnapshot(), [makeEntry()], EMPTY_SELECTION, "wing", null);

    expect(next).toMatchObject({
      wingId: null,
      flightId: null,
      branchId: BRANCH_ID,
      nestId: NEST_ID,
      featherId: "note-1",
    });
  });

  it("says so in both dropdowns above the course", () => {
    const selection = { ...EMPTY_SELECTION, branchId: BRANCH_ID };
    const labels = segmentLabels(sharedSnapshot(), [makeEntry()], selection);

    // Each dropdown is its own control and has to say what it is showing, so here the
    // label appears twice where the joined path shows it once.
    expect(labels).toMatchObject({
      wing: "Shared with you",
      flight: "Shared with you",
      branch: "Biology 101",
    });
  });

  it("still says 'no wing' in an empty workspace, which is not the same thing", () => {
    const labels = segmentLabels(makeSnapshot({ branches: [] }), [], EMPTY_SELECTION);

    expect(labels).toMatchObject({ wing: "No wing", flight: "No flight", branch: "No branch" });
  });

  it("does not put a shared course inside a wing of your own that has no terms", () => {
    const snapshot = makeSnapshot({
      flights: [],
      branches: [makeBranch({ id: "theirs", name: "Theirs", flightId: "a-term-not-here" })],
    });
    const selection = { ...EMPTY_SELECTION, wingId: WING_ID };

    // A new wing has no term yet, which is not the same as a course having no term you can
    // read. Conflating them files somebody else's course under yours.
    expect(segmentOptions(snapshot, [], selection).branch).toEqual([]);
  });

  it("does not cascade into one either", () => {
    const snapshot = makeSnapshot({
      flights: [],
      branches: [makeBranch({ id: "theirs", name: "Theirs", flightId: "a-term-not-here" })],
    });

    const next = resolveCascade(snapshot, [], EMPTY_SELECTION, "wing", WING_ID);

    expect(next).toMatchObject({ wingId: WING_ID, flightId: null, branchId: null });
  });

  it("finds the note under it, which is the point of reaching it at all", () => {
    const selection = { ...EMPTY_SELECTION, branchId: BRANCH_ID, nestId: NEST_ID };
    const options = segmentOptions(sharedSnapshot(), [makeEntry()], selection);

    expect(options.feather.map((option) => option.name)).toEqual(["Exam review"]);
  });
});
