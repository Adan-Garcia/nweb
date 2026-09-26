import { describe, expect, it } from "vitest";

import { mergeFields, mergeHtml, mergeLists, splitHtmlBlocks } from "./three-way";

describe("mergeLists", () => {
  it("keeps an edit from each side when they touched different items", () => {
    expect(mergeLists(["a", "b", "c"], ["A", "b", "c"], ["a", "b", "C"], "remote")).toEqual([
      "A",
      "b",
      "C",
    ]);
  });

  it("takes the one side that changed", () => {
    expect(mergeLists(["a", "b"], ["a", "b"], ["a", "x", "b"], "local")).toEqual(["a", "x", "b"]);
    expect(mergeLists(["a", "b"], ["a", "x", "b"], ["a", "b"], "remote")).toEqual(["a", "x", "b"]);
  });

  it("keeps a delete on one side when the other left the item alone", () => {
    expect(mergeLists(["a", "b", "c"], ["a", "c"], ["a", "b", "c", "d"], "local")).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("gives a clash on the same item to the preferred side, and only that item", () => {
    const base = ["a", "b", "c"];

    expect(mergeLists(base, ["a", "L", "c"], ["a", "R", "c"], "local")).toEqual(["a", "L", "c"]);
    expect(mergeLists(base, ["a", "L", "c"], ["a", "R", "c"], "remote")).toEqual(["a", "R", "c"]);
  });

  it("does not repeat an identical change made on both sides", () => {
    expect(mergeLists(["a"], ["a", "b"], ["a", "b"], "remote")).toEqual(["a", "b"]);
  });

  it("merges from an empty base", () => {
    expect(mergeLists([], ["x"], [], "remote")).toEqual(["x"]);
  });
});

describe("splitHtmlBlocks", () => {
  it("splits at the top level only, keeping a list whole", () => {
    expect(splitHtmlBlocks("<p>One</p><ul><li><p>a</p></li></ul><h2>Two</h2>")).toEqual([
      "<p>One</p>",
      "<ul><li><p>a</p></li></ul>",
      "<h2>Two</h2>",
    ]);
  });

  it("treats void and self-closing tags at the top as blocks of their own", () => {
    expect(splitHtmlBlocks('<p>a<br>b</p><hr><img src="x" />')).toEqual([
      "<p>a<br>b</p>",
      "<hr>",
      '<img src="x" />',
    ]);
  });

  it("keeps loose text between blocks, and a `>` inside a quoted attribute", () => {
    expect(splitHtmlBlocks('lead<p title="a>b">x</p>tail')).toEqual([
      "lead",
      '<p title="a>b">x</p>',
      "tail",
    ]);
  });

  it("falls back to one block for markup that does not balance", () => {
    expect(splitHtmlBlocks("<p>open")).toEqual(["<p>open"]);
  });
});

describe("mergeHtml", () => {
  it("keeps two people's edits to different paragraphs", () => {
    const base = "<p>One</p><p>Two</p><p>Three</p>";
    const local = "<p>One!</p><p>Two</p><p>Three</p>";
    const remote = "<p>One</p><p>Two</p><p>Three?</p>";

    expect(mergeHtml(base, local, remote, "remote")).toBe("<p>One!</p><p>Two</p><p>Three?</p>");
  });
});

describe("mergeFields", () => {
  it("keeps a rename from one side and a re-tag from the other", () => {
    expect(
      mergeFields(
        { feather: "Notes", nestIds: [] },
        { feather: "Entropy", nestIds: [] },
        { feather: "Notes", nestIds: ["unit-1"] },
        "remote",
      ),
    ).toEqual({ feather: "Entropy", nestIds: ["unit-1"] });
  });

  it("gives a field both changed to the preferred side", () => {
    expect(mergeFields({ name: "a" }, { name: "L" }, { name: "R" }, "local")).toEqual({
      name: "L",
    });
  });

  it("with no base, treats every disagreement as a clash", () => {
    expect(mergeFields(null, { name: "L", only: 1 }, { name: "R" }, "remote")).toEqual({
      name: "R",
      only: 1,
    });
  });
});

describe("mergeLists — in-place edits", () => {
  it("keeps edits to two adjacent items, which share no untouched neighbour", () => {
    expect(mergeLists(["a", "b"], ["A", "b"], ["a", "B"], "remote")).toEqual(["A", "B"]);
  });
});
