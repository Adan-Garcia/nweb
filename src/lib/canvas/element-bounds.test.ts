import { describe, expect, it } from "vitest";

import {
  contentBounds,
  elementBounds,
  localBounds,
  shapePoints,
  toElementSpace,
} from "./element-bounds";
import { layoutById, layoutPages } from "./pages";
import { createPage, type Shape } from "./scene-model";

const pages = layoutById(layoutPages([createPage("a0", "p1")]));

const box: Shape = {
  id: "b",
  version: 1,
  index: "a1",
  type: "shape",
  kind: "rectangle",
  x: 0,
  y: 0,
  width: 20,
  height: 10,
  rotation: 0,
  color: "ink-black",
  strokeWidth: 2,
  fill: null,
};

describe("element bounds", () => {
  it("bounds a shape by its corners, turned, with half its line width", () => {
    expect(localBounds(box)).toEqual({ x: -1, y: -1, width: 22, height: 12 });

    const turned = localBounds({ ...box, rotation: Math.PI / 2 });
    expect(turned.width).toBeCloseTo(12);
    expect(turned.height).toBeCloseTo(22);
  });

  it("bounds a line by its two ends", () => {
    expect(shapePoints({ ...box, kind: "line", width: -5, height: 5 })).toEqual([
      { x: 0, y: 0 },
      { x: -5, y: 5 },
    ]);
  });

  it("bounds strokes and images", () => {
    expect(
      localBounds({
        id: "s",
        version: 1,
        index: "a0",
        type: "stroke",
        tool: "pen",
        color: "ink-red",
        width: 2,
        x: 5,
        y: 5,
        samples: [0, 0, 0.5, 0, 0, 0, 10, 0, 0.5, 0, 0, 8],
      }),
    ).toEqual({ x: 3, y: 3, width: 14, height: 4 });
    expect(
      localBounds({
        id: "i",
        version: 1,
        index: "a0",
        type: "image",
        fileId: "f",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      }),
    ).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it("moves bounds into scene space by the element's page, and gives none for a lost page", () => {
    expect(elementBounds({ ...box, pageId: "p1" }, pages)).toEqual({
      x: -409,
      y: -1,
      width: 22,
      height: 12,
    });
    expect(elementBounds(box, pages)?.x).toBe(-1);
    expect(elementBounds({ ...box, pageId: "gone" }, pages)).toBeNull();
  });

  it("converts a scene point into an element's space", () => {
    expect(toElementSpace({ x: 0, y: 5 }, { pageId: "p1" }, pages)).toEqual({ x: 408, y: 5 });
    expect(toElementSpace({ x: 0, y: 5 }, {}, pages)).toEqual({ x: 0, y: 5 });
    expect(toElementSpace({ x: 0, y: 5 }, { pageId: "gone" }, pages)).toBeNull();
  });
});

describe("contentBounds", () => {
  it("frames everything drawn, and nothing for an empty note", () => {
    expect(contentBounds([box, { ...box, id: "b2", x: 100 }], pages)).toEqual({
      x: -1,
      y: -1,
      width: 122,
      height: 12,
    });
    expect(contentBounds([], pages)).toBeNull();
    expect(contentBounds([{ ...box, pageId: "gone" }], pages)).toBeNull();
  });
});
