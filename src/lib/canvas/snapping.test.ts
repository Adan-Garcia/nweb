import { describe, expect, it } from "vitest";

import { constrainDrag, shapeFromDrag, snapToGrid } from "./snapping";

const origin = { x: 0, y: 0 };

describe("constrainDrag", () => {
  it("turns a line to the nearest 15° and keeps its length", () => {
    const end = constrainDrag("line", origin, { x: 100, y: 3 });
    expect(end.x).toBeCloseTo(Math.hypot(100, 3));
    expect(end.y).toBeCloseTo(0);

    const diagonal = constrainDrag("line", origin, { x: 50, y: 52 });
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  it("squares a rectangle and rounds an ellipse on the longer side, in the drag's direction", () => {
    expect(constrainDrag("rectangle", origin, { x: -30, y: 10 })).toEqual({ x: -30, y: 30 });
    expect(constrainDrag("ellipse", origin, { x: 0, y: -20 })).toEqual({ x: 20, y: -20 });
    expect(constrainDrag("rectangle", origin, { x: -20, y: 0 })).toEqual({ x: -20, y: 20 });
  });
});

describe("shapeFromDrag", () => {
  it("stores a rectangle by its top-left and a positive size", () => {
    expect(
      shapeFromDrag(
        "rectangle",
        { x: 50, y: 40 },
        { x: 10, y: 60 },
        { shift: false, gridSpacing: null },
      ),
    ).toEqual({ x: 10, y: 40, width: 40, height: 20 });
  });

  it("stores a line by its start and the vector to its end", () => {
    expect(
      shapeFromDrag(
        "line",
        { x: 50, y: 40 },
        { x: 10, y: 60 },
        { shift: false, gridSpacing: null },
      ),
    ).toEqual({ x: 50, y: 40, width: -40, height: 20 });
  });

  it("snaps corners to the grid before constraining", () => {
    expect(
      shapeFromDrag("ellipse", { x: 5, y: 3 }, { x: 70, y: 40 }, { shift: true, gridSpacing: 24 }),
    ).toEqual({ x: 0, y: 0, width: 72, height: 72 });
  });

  it("rounds a point to the grid", () => {
    expect(snapToGrid({ x: 13, y: -13 }, 24)).toEqual({ x: 24, y: -24 });
  });
});
