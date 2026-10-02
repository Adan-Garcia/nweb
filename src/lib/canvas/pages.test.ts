import { describe, expect, it } from "vitest";

import {
  elementOrigin,
  fromPagePoint,
  insertPage,
  layoutById,
  layoutPages,
  movedPageIndex,
  movePage,
  orderedPages,
  PAGE_GAP,
  pageAt,
  pageDimensions,
  toPagePoint,
} from "./pages";
import { createPage, type Page, type Stroke } from "./scene-model";

const letter = createPage("a0", "p1");
const a4Landscape: Page = { ...createPage("a1", "p2"), size: "a4", orientation: "landscape" };

const stroke: Stroke = {
  id: "s",
  version: 1,
  index: "a5",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 10,
  y: 20,
  samples: [0, 0, 0.5, 0, 0, 0],
};

describe("page geometry", () => {
  it("sizes Letter and A4 at 96 dpi, turned for landscape", () => {
    expect(pageDimensions(letter)).toEqual({ width: 816, height: 1056 });
    expect(pageDimensions(a4Landscape)).toEqual({ width: 1123, height: 794 });
  });

  it("orders pages by their index, not by where they sit in the list", () => {
    expect(orderedPages({ elements: [a4Landscape, stroke, letter] }).map((p) => p.id)).toEqual([
      "p1",
      "p2",
    ]);
    expect(
      orderedPages({ elements: [letter, { ...letter, id: "same", index: "a0" }] }),
    ).toHaveLength(2);
  });

  it("stacks pages downward, each centred on x = 0, with a gap between", () => {
    const [first, second] = layoutPages([letter, a4Landscape]);

    expect(first.rect).toEqual({ x: -408, y: 0, width: 816, height: 1056 });
    expect(second.rect).toEqual({ x: -561.5, y: 1056 + PAGE_GAP, width: 1123, height: 794 });
  });

  it("finds the page under a point, and none in the gap between pages", () => {
    const layout = layoutPages([letter, a4Landscape]);

    expect(pageAt(layout, { x: 0, y: 10 })?.page.id).toBe("p1");
    expect(pageAt(layout, { x: 0, y: 1056 + PAGE_GAP + 1 })?.page.id).toBe("p2");
    expect(pageAt(layout, { x: 0, y: 1056 + PAGE_GAP / 2 })).toBeNull();
  });

  it("converts between page and scene space", () => {
    const [placed] = layoutPages([letter]);
    const scenePoint = fromPagePoint(placed, { x: 8, y: 9 });

    expect(scenePoint).toEqual({ x: -400, y: 9 });
    expect(toPagePoint(placed, scenePoint)).toEqual({ x: 8, y: 9 });
  });

  it("places an element by its page, or where it says when it has none", () => {
    const byId = layoutById(layoutPages([letter]));

    expect(elementOrigin(stroke, byId)).toEqual({ x: 10, y: 20 });
    expect(elementOrigin({ ...stroke, pageId: "p1" }, byId)).toEqual({ x: -398, y: 20 });
    expect(elementOrigin({ ...stroke, pageId: "gone" }, byId)).toBeNull();
  });
});

describe("insertPage", () => {
  it("adds a page after the one given, copying its paper", () => {
    const page = insertPage([letter, a4Landscape], "p1", "new");

    expect(page).toMatchObject({ id: "new", size: "letter", orientation: "portrait" });
    expect(page.index > letter.index && page.index < a4Landscape.index).toBe(true);
  });

  it("adds at the end when no page, or an unknown one, is given", () => {
    for (const after of [null, "missing"]) {
      const page = insertPage([letter, a4Landscape], after, "new");
      expect(page).toMatchObject({ size: "a4", orientation: "landscape" });
      expect(page.index > a4Landscape.index).toBe(true);
    }
  });

  it("starts an empty notebook with a Letter page", () => {
    expect(insertPage([], null, "only")).toMatchObject({
      index: "a0",
      size: "letter",
      background: "dots",
    });
    expect(insertPage([letter], null).id).not.toBe(insertPage([letter], null).id);
  });
});

describe("movedPageIndex", () => {
  const pages = [letter, a4Landscape, createPage("a2", "p3")];

  it("gives the index that puts a page at a new position", () => {
    const toFront = movedPageIndex(pages, "p3", 0);
    expect(toFront !== null && toFront < "a0").toBe(true);

    const toMiddle = movedPageIndex(pages, "p1", 1);
    expect(toMiddle !== null && toMiddle > "a1" && toMiddle < "a2").toBe(true);

    const toEnd = movedPageIndex(pages, "p1", 99);
    expect(toEnd !== null && toEnd > "a2").toBe(true);
  });

  it("returns null when the page does not move or does not exist", () => {
    expect(movedPageIndex(pages, "p2", 1)).toBeNull();
    expect(movedPageIndex(pages, "nope", 0)).toBeNull();
  });
});

describe("movePage", () => {
  const pages = [letter, a4Landscape, createPage("a2", "p3")];

  it("moves a page in the stack, bumping its version, and leaves the rest alone", () => {
    const moved = movePage(pages, "p3", 0);

    expect(moved && orderedPages({ elements: moved }).map((page) => page.id)).toEqual([
      "p3",
      "p1",
      "p2",
    ]);
    expect(moved?.[2].version).toBe(2);
    expect(moved?.[0]).toBe(letter);
  });

  it("returns null for a page that stays where it is", () => {
    expect(movePage(pages, "p1", 0)).toBeNull();
  });
});
