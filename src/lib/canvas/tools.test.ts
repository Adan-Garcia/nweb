import { describe, expect, it } from "vitest";

import { CANVAS_TOOLS, isEraser, isInkTool } from "./tools";

describe("tools", () => {
  it("counts everything but the lasso as ink", () => {
    expect(CANVAS_TOOLS.filter(isInkTool)).not.toContain("lasso");
    expect(CANVAS_TOOLS.filter((tool) => !isInkTool(tool))).toEqual(["lasso"]);
  });

  it("knows the two erasers", () => {
    expect(CANVAS_TOOLS.filter(isEraser)).toEqual(["eraser-stroke", "eraser-pixel"]);
  });
});
