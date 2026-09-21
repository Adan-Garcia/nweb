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
