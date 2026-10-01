import { describe, expect, it } from "vitest";

import { around, type GestureContext, placeFor, scanNearby } from "./gesture-types";
import { startGesture } from "./gestures";
import { layoutById, layoutPages, orderedPages } from "./pages";
import { createPage, createScene, type Scene, type Shape, type Stroke } from "./scene-model";
import type { InputSample } from "./stroke-geometry";

function context(scene: Scene, overrides: Partial<GestureContext> = {}): GestureContext {
  const pages = layoutPages(orderedPages(scene));
  const pagesById = layoutById(pages);
  let next = 0;

  return {
    scene,
    pages,
    pagesById,
    style: {
      color: "ink-blue",
      width: 2,
      sensitivity: 0.45,
      smoothing: 0.5,
      shapeKind: "rectangle",
      fill: null,
    },
    shift: false,
    radius: 4,
    zoom: 1,
    nearby: scanNearby(scene.elements, pagesById),
    newId: () => `new-${(next += 1)}`,
    ...overrides,
  };
}

const at = (x: number, y: number, time = 0): InputSample => ({
  x,
  y,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  time,
});

const line = (id: string, y: number, extra: Partial<Stroke> = {}): Stroke => ({
  id,
  version: 1,
  index: "a1",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y,
  samples: Array.from({ length: 11 }, (_, i) => [i * 10, 0, 0.5, 0, 0, i ? 8 : 0]).flat(),
  ...extra,
});

const infinite = createScene("infinite");
const paged: Scene = { format: 1, layout: "paged", elements: [createPage("a0", "page")] };
const none = new Set<string>();

describe("placeFor", () => {
  it("draws anywhere on an infinite canvas, snapping to its dots", () => {
    const place = placeFor(context(infinite), { x: 5, y: 5 });

    expect(place?.pageId).toBeUndefined();
    expect(place?.snap).toBe(24);
    expect(place?.toLocal({ x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(
      placeFor(context({ ...infinite, background: undefined }), { x: 0, y: 0 })?.snap,
    ).toBeNull();
  });

  it("draws on the page under the point of a paged note, and nowhere between pages", () => {
    const place = placeFor(context(paged), { x: 0, y: 10 });

    expect(place?.pageId).toBe("page");
    expect(place?.toLocal({ x: 0, y: 10 })).toEqual({ x: 408, y: 10 });
    expect(placeFor(context(paged), { x: 0, y: 5000 })).toBeNull();
  });

  it("finds what is near a point by scanning", () => {
    const scene = { ...infinite, elements: [line("a", 0), line("b", 500), createPage("a9", "p")] };
    const ctx = context(scene);

    expect(ctx.nearby(around({ x: 50, y: 0 }, 5)).map((element) => element.id)).toEqual(["a"]);
    expect(around({ x: 1, y: 2 }, 3)).toEqual({ x: -2, y: -1, width: 6, height: 6 });
  });
});

describe("ink", () => {
  it("records the zoom a stroke was drawn at, so it is smoothed at that scale", () => {
    const zoomed = context(infinite, { zoom: 2.5 });
    const gesture = startGesture("pen", at(10, 10), zoomed, none);

    expect(gesture?.end(zoomed).elements?.[0]).toMatchObject({ zoom: 2.5 });
  });

  it("adds a stroke of the current colour on top when the pen lifts", () => {
    const gesture = startGesture("pen", at(10, 10, 0), context(infinite), none);
    expect(gesture?.start).toEqual({});
    gesture?.move(at(20, 15, 8), context(infinite));
    gesture?.move(at(30, 20, 16), context(infinite));
    expect(gesture?.preview().elements[0]).toMatchObject({ type: "stroke", x: 10, y: 10 });

    const { elements } = gesture?.end(context(infinite)) ?? {};
    expect(elements).toHaveLength(1);
    expect(elements?.[0]).toMatchObject({ id: "new-1", tool: "pen", color: "ink-blue", width: 2 });
    expect(elements?.[0]).toMatchObject({ sensitivity: 0.45, smoothing: 0.5, zoom: 1 });
    expect(elements?.[0].type === "stroke" && elements[0].samples.length).toBe(18);
  });

  it("puts a stroke on its page in the page's own space", () => {
    const gesture = startGesture("highlighter", at(0, 10), context(paged), none);
    const { elements } = gesture?.end(context(paged)) ?? {};

    expect(elements?.[1]).toMatchObject({ tool: "highlighter", pageId: "page", x: 408, y: 10 });
    // A highlighter ignores pressure, so it records no sensitivity.
    expect(elements?.[1]).not.toHaveProperty("sensitivity");
  });

  it("draws nothing for a stroke begun between pages", () => {
    expect(startGesture("pen", at(0, 5000), context(paged), none)).toBeNull();
    expect(startGesture("shape", at(0, 5000), context(paged), none)).toBeNull();
  });
});

describe("shapes", () => {
  it("drags out a shape snapped to the grid, squared with Shift", () => {
    const gesture = startGesture("shape", at(1, 1), context(infinite), none);
    gesture?.move(at(70, 40), context(infinite, { shift: true }));
    const preview = gesture?.preview().elements[0];
    expect(preview).toMatchObject({ kind: "rectangle", x: 0, y: 0, width: 72, height: 72 });

    const { elements } = gesture?.end(context(infinite)) ?? {};
    expect(elements?.[0]).toMatchObject({
      type: "shape",
      strokeWidth: 2,
      color: "ink-blue",
      fill: null,
    });
  });

  it("drops a shape too small to see, and keeps a line on its page", () => {
    const tiny = startGesture(
      "shape",
      at(30, 30),
      context({ ...infinite, background: "blank" }),
      none,
    );
    tiny?.move(at(31, 31), context(infinite));
    expect(tiny?.end(context(infinite))).toEqual({});

    const lineContext = context(paged, {
      style: {
        color: "ink-red",
        width: 3,
        sensitivity: 0,
        smoothing: 0.5,
        shapeKind: "line",
        fill: null,
      },
    });
    const onPage = startGesture("shape", at(0, 10), lineContext, none);
    onPage?.move(at(100, 10), lineContext);
    expect(onPage?.end(lineContext).elements?.[1]).toMatchObject({
      kind: "line",
      pageId: "page",
      width: 96,
    });
  });
});

describe("erasers", () => {
  const scene = {
    ...infinite,
    elements: [line("top", 0), line("bottom", 100), line("locked", 50, { locked: true })],
  };

  it("takes whole strokes where the stroke eraser lands and wherever it passes", () => {
    const gesture = startGesture("eraser-stroke", at(50, 0), context(scene), none);
    expect(gesture?.start.elements?.map((element) => element.id)).toEqual(["bottom", "locked"]);

    const afterStart = { ...scene, elements: gesture?.start.elements ?? [] };
    const swipe = gesture?.move(at(50, 200), context(afterStart));
    expect(swipe?.elements?.map((element) => element.id)).toEqual(["locked"]);
    expect(gesture?.move(at(500, 500), context(afterStart))).toEqual({});
    expect(gesture?.end(context(afterStart))).toEqual({});
    expect(gesture?.preview().elements).toEqual([]);
  });

  it("cuts a stroke the pixel eraser crosses into new strokes, leaving shapes alone", () => {
    const box: Shape = {
      id: "box",
      version: 1,
      index: "a2",
      type: "shape",
      kind: "rectangle",
      x: 40,
      y: -20,
      width: 20,
      height: 40,
      rotation: 0,
      color: "ink-black",
      strokeWidth: 2,
      fill: null,
    };
    const cutScene = {
      ...infinite,
      elements: [line("s", 0), box, line("locked", 0, { id: "locked", locked: true })],
    };
    const gesture = startGesture("eraser-pixel", at(50, -30), context(cutScene), none);
    expect(gesture?.start).toEqual({});

    const update = gesture?.move(at(50, 30), context(cutScene));
    const ids = update?.elements?.map((element) => element.id);
    expect(ids).toEqual(["new-1", "new-2", "box", "locked"]);
    expect(gesture?.end(context(cutScene))).toEqual({});
    expect(gesture?.preview().lasso).toBeNull();
  });

  it("leaves ink on a lost page to the stroke eraser and the lasso alike", () => {
    const lost = { ...line("lost", 0), pageId: "gone" };
    const scene = { ...infinite, elements: [lost] };
    // `nearby` is a spatial index in the app; hand the lost stroke over as if it were near.
    const ctx = context(scene, { nearby: () => [lost] });

    expect(startGesture("eraser-pixel", at(50, 0), ctx, none)?.start).toEqual({});
    expect(startGesture("lasso", at(50, 0), ctx, new Set(["lost"]))?.start).toEqual({
      selection: [],
    });
  });

  it("cuts where the pixel eraser first lands", () => {
    const gesture = startGesture(
      "eraser-pixel",
      at(50, 0),
      context({ ...infinite, elements: [line("s", 0)] }),
      none,
    );

    expect(gesture?.start.elements?.map((element) => element.id)).toEqual(["new-1", "new-2"]);
  });
});

describe("the lasso", () => {
  const scene = { ...infinite, elements: [line("in", 0), line("out", 500)] };
  const loop = [at(-10, -10), at(120, -10), at(120, 10), at(-10, 10)];

  it("selects what it closes around when released", () => {
    const gesture = startGesture("lasso", loop[0], context(scene), none);
    expect(gesture?.start).toEqual({ selection: [] });
    for (const point of loop.slice(1)) {
      gesture?.move(point, context(scene));
    }

    expect(gesture?.preview().lasso).toHaveLength(4);
    expect(gesture?.end(context(scene))).toEqual({ selection: ["in"] });
  });

  it("drags a selection when pressed inside it, moving it once at the end", () => {
    const selection = new Set(["in"]);
    const gesture = startGesture("lasso", at(50, 0), context(scene), selection);
    gesture?.move(at(60, 30), context(scene));

    const preview = gesture?.preview();
    expect(preview?.hidden).toBe(selection);
    expect(preview?.elements[0]).toMatchObject({ id: "in", x: 10, y: 30 });

    const { elements } = gesture?.end(context(scene)) ?? {};
    expect(elements?.[0]).toMatchObject({ id: "in", x: 10, y: 30, version: 2 });
  });

  it("changes nothing for a press on the selection that does not move", () => {
    const gesture = startGesture("lasso", at(50, 0), context(scene), new Set(["in"]));

    expect(gesture?.end(context(scene))).toEqual({});
  });

  it("starts a new lasso outside the selection", () => {
    const gesture = startGesture("lasso", at(900, 900), context(scene), new Set(["in"]));

    expect(gesture?.start).toEqual({ selection: [] });
  });
});
