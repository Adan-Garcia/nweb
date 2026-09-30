import { describe, expect, it } from "vitest";

import {
  distance,
  distanceToSegment,
  EMPTY_RECT,
  expandRect,
  rectContains,
  rectFromPoints,
  rectsIntersect,
  rotatePoint,
  unionRects,
} from "./geometry";

describe("rectangles", () => {
  it("bounds a set of points", () => {
    expect(
      rectFromPoints([
        { x: 3, y: -1 },
        { x: -2, y: 4 },
        { x: 1, y: 1 },
      ]),
    ).toEqual({ x: -2, y: -1, width: 5, height: 5 });
    expect(rectFromPoints([])).toBe(EMPTY_RECT);
  });

  it("unites rectangles, and has nothing to unite when there are none", () => {
    expect(
      unionRects([
        { x: 0, y: 0, width: 2, height: 2 },
        { x: 5, y: -3, width: 1, height: 1 },
      ]),
    ).toEqual({ x: 0, y: -3, width: 6, height: 5 });
    expect(unionRects([])).toBeNull();
  });

  it("grows a rectangle on every side", () => {
    expect(expandRect({ x: 0, y: 0, width: 2, height: 2 }, 1)).toEqual({
      x: -1,
      y: -1,
      width: 4,
      height: 4,
    });
  });

  it("tells overlapping rectangles from separate ones, touching counting as overlap", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 10, y: 10, width: 1, height: 1 })).toBe(true);
    expect(rectsIntersect(a, { x: 11, y: 0, width: 1, height: 1 })).toBe(false);
    expect(rectsIntersect(a, { x: 0, y: -5, width: 1, height: 4 })).toBe(false);
  });

  it("knows which points a rectangle holds", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectContains(rect, { x: 10, y: 0 })).toBe(true);
    expect(rectContains(rect, { x: -0.1, y: 5 })).toBe(false);
    expect(rectContains(rect, { x: 5, y: 10.1 })).toBe(false);
  });
});

describe("distances and rotation", () => {
  it("measures between points and from a point to a segment", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });

  it("rotates a point about a centre", () => {
    const rotated = rotatePoint({ x: 2, y: 1 }, { x: 1, y: 1 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(1);
    expect(rotated.y).toBeCloseTo(2);
  });
});
