import { describe, expect, it } from "vitest";

import { erasableAt, hitsShape, hitsStroke, imageAt, selectedByLasso } from "./hit-test";
import { layoutById, layoutPages } from "./pages";
import { createPage, type ImageElement, type Shape, type Stroke } from "./scene-model";

const noPages = new Map();
const pages = layoutById(layoutPages([createPage("a0", "p1")]));

// A horizontal line from (0, 0) to (100, 0), width 4.
const stroke: Stroke = {
  id: "s",
  version: 1,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 4,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 100, 0, 0.5, 0, 0, 8],
};

const box: Shape = {
  id: "r",
  version: 1,
  index: "a1",
  type: "shape",
  kind: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  rotation: 0,
  color: "ink-black",
  strokeWidth: 2,
  fill: null,
};

const image: ImageElement = {
  id: "i",
  version: 1,
  index: "a2",
  type: "image",
  fileId: "f",
  x: 200,
  y: 0,
  width: 50,
  height: 50,
};

describe("hitsStroke", () => {
  it("hits within the eraser's radius of the line, allowing for its width", () => {
    expect(hitsStroke(stroke, { x: 50, y: 5 }, 3)).toBe(true);
    expect(hitsStroke(stroke, { x: 50, y: 6 }, 3)).toBe(false);
    expect(hitsStroke(stroke, { x: 104, y: 0 }, 3)).toBe(true);
  });

  it("hits a single-sample dot around its point", () => {
    const dot = { ...stroke, x: 10, y: 10, samples: [0, 0, 0.5, 0, 0, 0] };
    expect(hitsStroke(dot, { x: 13, y: 10 }, 1)).toBe(true);
    expect(hitsStroke(dot, { x: 14, y: 10 }, 1)).toBe(false);
  });
});

describe("hitsShape", () => {
  it("hits an unfilled rectangle on its outline only", () => {
    expect(hitsShape(box, { x: 50, y: 1 }, 1)).toBe(true);
    expect(hitsShape(box, { x: 50, y: 25 }, 1)).toBe(false);
    expect(hitsShape(box, { x: 150, y: 25 }, 1)).toBe(false);
  });

  it("hits a filled rectangle anywhere inside", () => {
    expect(hitsShape({ ...box, fill: "ink-yellow" }, { x: 50, y: 25 }, 1)).toBe(true);
    expect(hitsShape({ ...box, fill: "ink-yellow" }, { x: 150, y: 25 }, 1)).toBe(false);
  });

  it("follows a rotated rectangle", () => {
    const turned = { ...box, rotation: Math.PI / 2 };
    // Turned about its centre (50, 25), its long sides now run up and down at x = 25 and 75.
    expect(hitsShape(turned, { x: 25, y: 25 }, 1)).toBe(true);
    expect(hitsShape(turned, { x: 50, y: 0 }, 1)).toBe(false);
  });

  it("hits an ellipse on its outline, or inside when filled", () => {
    const ellipse = { ...box, kind: "ellipse" as const };
    expect(hitsShape(ellipse, { x: 100, y: 25 }, 1)).toBe(true);
    expect(hitsShape(ellipse, { x: 50, y: 0 }, 1)).toBe(true);
    expect(hitsShape(ellipse, { x: 50, y: 25 }, 1)).toBe(false);
    expect(hitsShape({ ...ellipse, fill: "#ffffff" }, { x: 50, y: 25 }, 1)).toBe(true);
    expect(hitsShape({ ...ellipse, fill: "#ffffff" }, { x: 0, y: 0 }, 1)).toBe(false);
  });

  it("hits a line near its segment", () => {
    const line = { ...box, kind: "line" as const, width: 100, height: 0 };
    expect(hitsShape(line, { x: 50, y: 2 }, 1)).toBe(true);
    expect(hitsShape(line, { x: 50, y: 3 }, 1)).toBe(false);
  });
});

describe("erasableAt", () => {
  it("erases strokes and shapes, never images or anything locked", () => {
    const elements = [stroke, box, image, { ...stroke, id: "locked", locked: true }];

    expect(erasableAt(elements, { x: 0, y: 0 }, 2, noPages)).toEqual(["s", "r"]);
    expect(erasableAt(elements, { x: 225, y: 25 }, 2, noPages)).toEqual([]);
  });

  it("finds ink on a page by its page, and skips ink on a lost page", () => {
    const onPage = { ...stroke, pageId: "p1" };
    expect(erasableAt([onPage], { x: -408 + 50, y: 0 }, 2, pages)).toEqual(["s"]);
    expect(erasableAt([{ ...stroke, pageId: "gone" }], { x: 50, y: 0 }, 2, pages)).toEqual([]);
  });
});

describe("selectedByLasso", () => {
  const loop = [
    { x: -10, y: -10 },
    { x: 60, y: -10 },
    { x: 60, y: 60 },
    { x: -10, y: 60 },
  ];

  it("takes a stroke when at least half of it is inside", () => {
    const half = { ...stroke, samples: [0, 0, 0.5, 0, 0, 0, 100, 0, 0.5, 0, 0, 8] };
    const mostlyOut = { ...stroke, id: "out", samples: [...half.samples, 200, 0, 0.5, 0, 0, 8] };

    expect(selectedByLasso([half, mostlyOut], loop, noPages)).toEqual(["s"]);
  });

  it("takes shapes and images by their centre, and never locked or lost elements", () => {
    const small = { ...box, id: "small", width: 20, height: 20 };
    const outside = { ...box, x: 40 };
    const inImage = { ...image, x: 0, y: 0, width: 40, height: 40 };

    expect(
      selectedByLasso(
        [
          small,
          outside,
          inImage,
          { ...small, id: "l", locked: true },
          { ...small, id: "g", pageId: "x" },
        ],
        loop,
        noPages,
      ),
    ).toEqual(["small", "i"]);
  });

  it("selects nothing with a loop too short to enclose anything", () => {
    expect(selectedByLasso([stroke], loop.slice(0, 2), noPages)).toEqual([]);
  });
});

describe("imageAt", () => {
  it("picks the topmost image under the point", () => {
    const below = { ...image, id: "below" };
    const above = { ...image, id: "above" };

    expect(imageAt([stroke, below, above], { x: 210, y: 10 }, noPages)).toBe("above");
    expect(imageAt([stroke, below], { x: 10, y: 0 }, noPages)).toBeNull();
    expect(imageAt([{ ...image, pageId: "gone" }], { x: 210, y: 10 }, pages)).toBeNull();
  });
});
