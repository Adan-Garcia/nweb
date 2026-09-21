import { afterEach, describe, expect, it, vi } from "vitest";

import {
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

describe("defaultLinearContent", () => {
  it("is a small HTML starter document", () => {
    expect(defaultLinearContent).toContain("<h2>Lecture Notes</h2>");
  });
});
