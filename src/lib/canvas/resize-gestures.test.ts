import { describe, expect, it } from "vitest";

import { scanNearby } from "./gesture-types";
import { startGesture } from "./gestures";
import { cornerPoint, handleAt, resizeFactor } from "./resize-gestures";
import { createScene, type Scene, type Stroke } from "./scene-model";
import type { InputSample } from "./stroke-geometry";

const box = { x: 0, y: 0, width: 100, height: 50 };

const at = (x: number, y: number): InputSample => ({
  x,
  y,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  time: 0,
});

describe("corner handles", () => {
  it("sits a handle on each corner of the box", () => {
    expect(cornerPoint(box, "nw")).toEqual({ x: 0, y: 0 });
    expect(cornerPoint(box, "ne")).toEqual({ x: 100, y: 0 });
    expect(cornerPoint(box, "se")).toEqual({ x: 100, y: 50 });
    expect(cornerPoint(box, "sw")).toEqual({ x: 0, y: 50 });
  });

  it("finds the handle under a press, the nearer of two that reach", () => {
    expect(handleAt(box, { x: 98, y: 52 }, 5)).toBe("se");
    expect(handleAt(box, { x: 50, y: 25 }, 5)).toBeNull();
    expect(handleAt({ x: 0, y: 0, width: 4, height: 4 }, { x: 3, y: 0 }, 5)).toBe("ne");
  });

  it("scales by whichever axis was dragged further, never to nothing", () => {
    expect(resizeFactor(box, "se", { x: 200, y: 60 })).toBe(2);
    expect(resizeFactor(box, "nw", { x: 50, y: -50 })).toBe(2);
    expect(resizeFactor(box, "se", { x: -500, y: -500 })).toBe(0.05);
    expect(resizeFactor({ x: 0, y: 0, width: 0, height: 10 }, "se", { x: 9, y: 20 })).toBe(2);
  });
});

describe("resizing a selection", () => {
  const ink: Stroke = {
    id: "ink",
    version: 1,
    index: "a1",
    type: "stroke",
    tool: "pen",
    color: "ink-black",
    width: 2,
    x: 0,
    y: 0,
    samples: [0, 0, 0.5, 0, 0, 0, 100, 0, 0.5, 0, 0, 8],
  };
  const scene: Scene = { ...createScene("infinite"), elements: [ink] };
  const context = {
    scene,
    pages: [],
    pagesById: new Map(),
    style: {
      color: "ink-blue",
      width: 2,
      sensitivity: 0,
      smoothing: 0.5,
      shapeKind: "rectangle" as const,
      fill: null,
    },
    shift: false,
    radius: 4,
    zoom: 1,
    nearby: scanNearby(scene.elements, new Map()),
    newId: () => "new",
  };
  const selection = new Set(["ink"]);

  it("drags the bottom-right handle to scale about the top-left, once, at the end", () => {
    // The stroke's box runs from (-2, -2) to (102, 2).
    const gesture = startGesture("lasso", at(102, 2), context, selection);
    gesture?.move(at(206, 6), context);

    const preview = gesture?.preview();
    expect(preview?.hidden).toBe(selection);
    expect(preview?.elements[0]).toMatchObject({ x: 2, y: 2, width: 4 });

    const { elements } = gesture?.end(context) ?? {};
    expect(elements?.[0]).toMatchObject({ id: "ink", x: 2, y: 2, width: 4, version: 2 });
  });

  it("changes nothing for a handle pressed and let go", () => {
    const gesture = startGesture("lasso", at(-2, -2), context, selection);

    expect(gesture?.end(context)).toEqual({});
  });
});
