import { describe, expect, it } from "vitest";

import type { NotesDirectoryEntry, NotesHierarchyLocation } from "@/components/notes/types";

import {
  buildSegmentOptions,
  FALLBACK_LOCATION,
  getEntryForLocation,
  listSegmentOptions,
  normalizeLocation,
  resolveCascadingLocation,
  toLocation,
} from "./location-hierarchy";

function entry(
  wing: string,
  flight: string,
  branch: string,
  nest: string,
  feather: string,
): NotesDirectoryEntry {
  return {
    id: `${wing}/${flight}/${branch}/${nest}/${feather}`,
    wing,
    flight,
    branch,
    nest,
    feather,
    createdMode: "linear",
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
}

const entries = [
  entry("Home", "Fall 2026", "Math", "Unit 1", "Notes A"),
  entry("Home", "Fall 2026", "Math", "Unit 2", "Notes B"),
  entry("Home", "Fall 2026", "History", "Essays", "Draft"),
  entry("Home", "Spring 2027", "Physics", "Labs", "Lab 1"),
  entry("Work", "Q1", "Ops", "Runbooks", "Oncall"),
];

const location: NotesHierarchyLocation = {
  wing: "Home",
  flight: "Fall 2026",
  branch: "Math",
  nest: "Unit 1",
  feather: "Notes A",
};

describe("buildSegmentOptions", () => {
  it("drops blanks, sorts, and always includes the active value", () => {
    expect(buildSegmentOptions(["b", " ", "a"], "c")).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate the active value or add a blank one", () => {
    expect(buildSegmentOptions(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(buildSegmentOptions(["a"], "  ")).toEqual(["a"]);
  });
});

describe("getEntryForLocation", () => {
  it("finds the entry matching every segment", () => {
    expect(getEntryForLocation(entries, location)?.id).toBe("Home/Fall 2026/Math/Unit 1/Notes A");
  });

  it("returns null when no entry matches", () => {
    expect(getEntryForLocation(entries, { ...location, feather: "Missing" })).toBeNull();
  });
});

describe("listSegmentOptions", () => {
  it("lists every wing", () => {
    expect(listSegmentOptions(entries, location, "wing")).toEqual(["Home", "Work"]);
  });

  it("narrows each segment to its parents", () => {
    expect(listSegmentOptions(entries, location, "flight")).toEqual(["Fall 2026", "Spring 2027"]);
    expect(listSegmentOptions(entries, location, "branch")).toEqual(["History", "Math"]);
    expect(listSegmentOptions(entries, location, "nest")).toEqual(["Unit 1", "Unit 2"]);
    expect(listSegmentOptions(entries, location, "feather")).toEqual(["Notes A"]);
  });
});

describe("resolveCascadingLocation", () => {
  it("keeps child segments that are still valid under the new parent", () => {
    const next = resolveCascadingLocation(entries, location, "flight", "Fall 2026");
    expect(next).toEqual(location);
  });

  it("resets child segments to the first valid option when the parent changes", () => {
    const next = resolveCascadingLocation(entries, location, "wing", "Work");
    expect(next).toEqual({
      wing: "Work",
      flight: "Q1",
      branch: "Ops",
      nest: "Runbooks",
      feather: "Oncall",
    });
  });

  it("keeps existing children when the new parent has no options", () => {
    const next = resolveCascadingLocation(entries, location, "wing", "Brand New");
    expect(next).toEqual({ ...location, wing: "Brand New" });
  });

  it("does not mutate the current location", () => {
    const before = { ...location };
    resolveCascadingLocation(entries, location, "wing", "Work");
    expect(location).toEqual(before);
  });
});

describe("toLocation", () => {
  it("keeps only the five hierarchy segments of a directory entry", () => {
    expect(toLocation(entries[0])).toEqual(location);
  });
});

describe("normalizeLocation", () => {
  it("trims and collapses whitespace in every segment", () => {
    expect(
      normalizeLocation({
        wing: "  My   Wing ",
        flight: "Fall\t2026",
        branch: " Math ",
        nest: "Unit  1",
        feather: "  Notes A  ",
      }),
    ).toEqual({
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "Math",
      nest: "Unit 1",
      feather: "Notes A",
    });
  });

  it("falls back to the default value for blank segments", () => {
    expect(
      normalizeLocation({ wing: "", flight: "  ", branch: "", nest: "\n", feather: "" }),
    ).toEqual(FALLBACK_LOCATION);
  });

  it("only replaces the blank segments", () => {
    expect(normalizeLocation({ ...location, nest: "" })).toEqual({
      ...location,
      nest: FALLBACK_LOCATION.nest,
    });
  });
});
