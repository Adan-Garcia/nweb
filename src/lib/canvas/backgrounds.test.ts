import { describe, expect, it } from "vitest";

import { backgroundMarks, GRID_SPACING, RULED_SPACING, snapSpacing } from "./backgrounds";

const area = { x: -10, y: 0, width: 60, height: 50 };

describe("backgroundMarks", () => {
  it("draws nothing for a blank background", () => {
    expect(backgroundMarks("blank", area, 1)).toEqual({ kind: "none" });
  });

  it("puts dots on the grid, aligned to the origin rather than the view", () => {
    const marks = backgroundMarks("dots", area, 1);

    expect(marks.kind === "dots" && marks.points).toEqual(
      [0, 24, 48].flatMap((y) => [0, 24, 48].map((x) => ({ x, y }))),
    );
  });

  it("draws ruled lines across the area, and a grid both ways", () => {
    const ruled = backgroundMarks("ruled", area, 1);
    expect(ruled.kind === "lines" && ruled.segments).toEqual([
      [
        { x: -10, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: -10, y: RULED_SPACING },
        { x: 50, y: RULED_SPACING },
      ],
    ]);

    const grid = backgroundMarks("grid", area, 1);
    expect(grid.kind === "lines" && grid.segments).toHaveLength(3 + 3);
  });

  it("leaves a pattern out once zooming out packs it too tightly to see", () => {
    expect(backgroundMarks("dots", area, 0.2)).toEqual({ kind: "none" });
    expect(backgroundMarks("ruled", area, 0.2).kind).toBe("lines");
  });
});

describe("snapSpacing", () => {
  it("snaps to the grid on dots and grid only", () => {
    expect(snapSpacing("dots")).toBe(GRID_SPACING);
    expect(snapSpacing("grid")).toBe(GRID_SPACING);
    expect(snapSpacing("ruled")).toBeNull();
    expect(snapSpacing("blank")).toBeNull();
  });
});
