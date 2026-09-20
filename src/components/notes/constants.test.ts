import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNotesDocumentId,
  createDefaultNotesLocation,
  defaultLinearContent,
  sanitizeLocationSegment,
} from "./constants";

afterEach(() => vi.useRealTimers());

describe("createDefaultNotesLocation", () => {
  it.each([
    [0, "Spring"],
    [4, "Spring"],
    [5, "Summer"],
    [7, "Summer"],
    [8, "Fall"],
    [11, "Fall"],
  ])("month index %i is in the %s term", (month, term) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, month, 15));

    expect(createDefaultNotesLocation()).toEqual({
      wing: "My Wing",
      flight: `${term} 2026`,
      branch: "General",
      nest: "Inbox",
      feather: "Untitled note",
    });
  });
});

describe("sanitizeLocationSegment", () => {
  it("trims and collapses internal whitespace", () => {
    expect(sanitizeLocationSegment("  Bio   101 \n")).toBe("Bio 101");
    expect(sanitizeLocationSegment("   ")).toBe("");
  });
});

describe("buildNotesDocumentId", () => {
  const location = {
    wing: "My Wing",
    flight: "Fall 2026",
    branch: "Bio 101",
    nest: "Unit 4",
    feather: "Exam review",
  };

  it("slugifies each segment into a stable id", () => {
    expect(buildNotesDocumentId(location)).toBe(
      "notes-my-wing-fall-2026-bio-101-unit-4-exam-review",
    );
  });

  it("collapses punctuation and never returns an empty segment", () => {
    expect(buildNotesDocumentId({ ...location, wing: "  !!Café & Co.  ", feather: "???" })).toBe(
      "notes-caf-co-fall-2026-bio-101-unit-4-untitled",
    );
  });

  it("gives the same id for the same location, and different ids for different ones", () => {
    expect(buildNotesDocumentId(location)).toBe(buildNotesDocumentId({ ...location }));
    expect(buildNotesDocumentId(location)).not.toBe(
      buildNotesDocumentId({ ...location, feather: "Other" }),
    );
  });
});

describe("defaultLinearContent", () => {
  it("is a small HTML starter document", () => {
    expect(defaultLinearContent).toContain("<h2>Lecture Notes</h2>");
  });
});
