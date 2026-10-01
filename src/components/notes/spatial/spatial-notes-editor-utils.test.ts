import { describe, expect, it } from "vitest";

import { fitWithinBounds, parsePdfPageSelection } from "./spatial-notes-editor-utils";

describe("fitWithinBounds", () => {
  it("leaves a size that already fits untouched (never scales up)", () => {
    expect(fitWithinBounds(400, 300, 1000, 1000)).toEqual({ width: 400, height: 300 });
  });

  it("scales down by the tighter constraint, keeping the aspect ratio", () => {
    expect(fitWithinBounds(2000, 1000, 1000, 1400)).toEqual({ width: 1000, height: 500 });
    expect(fitWithinBounds(1000, 3000, 1000, 1500)).toEqual({ width: 500, height: 1500 });
  });

  it("rounds to whole pixels and never returns less than 1", () => {
    expect(fitWithinBounds(3, 1000, 1000, 10)).toEqual({ width: 1, height: 10 });
  });

  it("returns 1x1 for an empty or negative size", () => {
    expect(fitWithinBounds(0, 100, 10, 10)).toEqual({ width: 1, height: 1 });
    expect(fitWithinBounds(100, -5, 10, 10)).toEqual({ width: 1, height: 1 });
  });
});

describe("parsePdfPageSelection", () => {
  it("defaults to the first page for blank input", () => {
    expect(parsePdfPageSelection("", 10)).toEqual([1]);
    expect(parsePdfPageSelection("   ", 10)).toEqual([1]);
  });

  it("selects every page for 'all' in any case", () => {
    expect(parsePdfPageSelection("ALL", 3)).toEqual([1, 2, 3]);
  });

  it("parses single pages, ranges and mixes, sorted and de-duplicated", () => {
    expect(parsePdfPageSelection("1, 3-5", 10)).toEqual([1, 3, 4, 5]);
    expect(parsePdfPageSelection("5,1,3-4,4", 10)).toEqual([1, 3, 4, 5]);
    expect(parsePdfPageSelection("1,,2", 10)).toEqual([1, 2]);
  });

  it("accepts a reversed range", () => {
    expect(parsePdfPageSelection("5-3", 10)).toEqual([3, 4, 5]);
  });

  it.each([
    ["abc", "Invalid page number."],
    ["0", "Invalid page number."],
    ["11", "Invalid page number."],
    ["1-", "Invalid page range."],
    ["-3", "Invalid page range."],
    ["1-2-3", "Invalid page range."],
    ["a-b", "Invalid page range."],
    ["8-12", "Page range is out of bounds."],
    ["0-3", "Page range is out of bounds."],
    [",", "No pages were selected."],
  ])("rejects %s", (input, message) => {
    expect(() => parsePdfPageSelection(input, 10)).toThrow(message);
  });
});
