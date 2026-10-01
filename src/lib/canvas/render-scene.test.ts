import { describe, expect, it } from "vitest";

import { layoutById, layoutPages } from "./pages";
import type { CanvasTheme, DrawingContext, OutlineCache } from "./render-elements";
import { cachedBounds, drawElement, layerOf } from "./render-elements";
import { renderPreview, renderScene } from "./render-scene";
import {
  createPage,
  createScene,
  type ImageElement,
  type Scene,
  type Shape,
  type Stroke,
} from "./scene-model";

/** A 2D context that records the name of every call, and every value set on it. */
function recorder() {
  const calls: string[] = [];
  const call =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.length})`);
    };
  const setting = <T>(name: string, initial: T) => {
    let value = initial;
    return {
      get: () => value,
      set: (next: T) => {
        calls.push(`${name}=${String(next)}`);
        value = next;
      },
    };
  };
  const base: DrawingContext = {
    save: call("save"),
    restore: call("restore"),
    setTransform: call("setTransform"),
    transform: call("transform"),
    clearRect: call("clearRect"),
    fillRect: call("fillRect"),
    strokeRect: call("strokeRect"),
    beginPath: call("beginPath"),
    moveTo: call("moveTo"),
    lineTo: call("lineTo"),
    closePath: call("closePath"),
    fill: call("fill"),
    stroke: call("stroke"),
    rect: call("rect"),
    arc: call("arc"),
    ellipse: call("ellipse"),
    clip: call("clip"),
    drawImage: call("drawImage"),
    setLineDash: call("setLineDash"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
  };
  const ctx = Object.defineProperties(base, {
    fillStyle: setting("fillStyle", ""),
    strokeStyle: setting("strokeStyle", ""),
    lineWidth: setting("lineWidth", 1),
    lineCap: setting("lineCap", "butt"),
    lineJoin: setting("lineJoin", "miter"),
    globalAlpha: setting("globalAlpha", 1),
  });

  return { ctx, calls };
}

const theme: CanvasTheme = {
  dark: false,
  paper: "white",
  gap: "grey",
  marks: "silver",
  selection: "blue",
};

const stroke = (
  id: string,
  tool: Stroke["tool"],
  index: string,
  extra: Partial<Stroke> = {},
): Stroke => ({
  id,
  version: 1,
  index,
  type: "stroke",
  tool,
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 40, 0, 0.5, 0, 0, 8],
  ...extra,
});

const shape = (kind: Shape["kind"], extra: Partial<Shape> = {}): Shape => ({
  id: kind,
  version: 1,
  index: "a5",
  type: "shape",
  kind,
  x: 0,
  y: 0,
  width: 30,
  height: 20,
  rotation: 0,
  color: "ink-red",
  strokeWidth: 2,
  fill: null,
  ...extra,
});

const image: ImageElement = {
  id: "img",
  version: 1,
  index: "a9",
  type: "image",
  fileId: "pic",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
};
const picture = document.createElement("canvas");

const options = (
  extra: { images?: Map<string, CanvasImageSource>; cache?: OutlineCache } = {},
) => ({
  camera: { x: -100, y: -100, zoom: 1 },
  viewport: { width: 400, height: 300 },
  dpr: 2,
  theme,
  images: extra.images ?? new Map(),
  cache: extra.cache ?? new Map(),
});

describe("renderScene", () => {
  it("clears, draws the dots, then images, highlighter and ink in that order", () => {
    const { ctx, calls } = recorder();
    const scene: Scene = {
      ...createScene("infinite"),
      elements: [stroke("ink", "pen", "a0"), image, stroke("marker", "highlighter", "a1")],
    };

    renderScene(ctx, scene, [], options({ images: new Map([["pic", picture]]) }));

    expect(calls.slice(0, 3)).toEqual(["setTransform(6)", "clearRect(4)", "setTransform(6)"]);
    expect(calls).toContain("globalAlpha=0.35");
    const draws = calls.filter((call) => call.startsWith("drawImage") || call.startsWith("fill("));
    // Dots, then the image, then the highlighter, then the pen.
    expect(draws).toEqual(["fill(0)", "drawImage(5)", "fill(0)", "fill(0)"]);
  });

  it("leaves out hidden elements and those outside the view, and outlines unloaded images", () => {
    const { ctx, calls } = recorder();
    const far = stroke("far", "pen", "a2", { x: 5000 });
    const scene: Scene = {
      ...createScene("infinite"),
      background: "blank",
      elements: [far, stroke("hidden", "pen", "a3"), image],
    };

    renderScene(ctx, scene, [], { ...options(), hidden: new Set(["hidden"]) });

    expect(calls.filter((call) => call === "fill(0)")).toEqual([]);
    expect(calls).toContain("strokeRect(4)");
  });

  it("draws each page in view on the gap, with its PDF and only its own ink, clipped", () => {
    const { ctx, calls } = recorder();
    const page = {
      ...createPage("a0", "p1"),
      background: "ruled" as const,
      pdf: { fileId: "pdf" },
    };
    const offscreen = createPage("a1", "p2");
    const scene: Scene = {
      format: 1,
      layout: "paged",
      elements: [
        page,
        offscreen,
        stroke("mine", "pen", "a3", { pageId: "p1", x: 400 }),
        stroke("free", "pen", "a4", { x: 0, y: 5 }),
      ],
    };
    const pages = layoutPages([page, offscreen]);

    renderScene(ctx, scene, pages, {
      ...options({ images: new Map([["pdf", picture]]) }),
      camera: { x: -200, y: -50, zoom: 1 },
    });

    expect(calls.filter((call) => call.startsWith("fillStyle="))).toEqual(
      expect.arrayContaining(["fillStyle=grey", "fillStyle=white"]),
    );
    expect(calls.filter((call) => call === "clip(0)")).toHaveLength(1);
    expect(calls).toContain("drawImage(5)");
    expect(calls).toContain("stroke(0)");
    // The page's ink and the free stroke are both drawn.
    expect(calls.filter((call) => call === "fill(0)")).toHaveLength(2);
  });

  it("draws a page whose PDF has not loaded yet without it", () => {
    const { ctx, calls } = recorder();
    const page = { ...createPage("a0", "p1"), pdf: { fileId: "pdf" } };

    renderScene(ctx, { format: 1, layout: "paged", elements: [page] }, layoutPages([page]), {
      ...options(),
      camera: { x: -200, y: -50, zoom: 1 },
    });

    expect(calls).not.toContain("drawImage(5)");
    expect(calls).toContain("clip(0)");

    const plain = createPage("a0", "p2");
    const { ctx: plainCtx, calls: plainCalls } = recorder();
    renderScene(plainCtx, { format: 1, layout: "paged", elements: [plain] }, layoutPages([plain]), {
      ...options(),
      camera: { x: -200, y: -50, zoom: 1 },
    });
    expect(plainCalls).not.toContain("drawImage(5)");
  });

  it("outlines the selection with a dashed box", () => {
    const { ctx, calls } = recorder();

    renderScene(ctx, createScene("infinite"), [], {
      ...options(),
      selection: { x: 0, y: 0, width: 5, height: 5 },
    });

    expect(calls).toContain("setLineDash(1)");
    expect(calls).toContain("strokeRect(4)");
  });

  it("treats a scene with no background as blank", () => {
    const { ctx, calls } = recorder();

    renderScene(ctx, { ...createScene("infinite"), background: undefined }, [], options());

    expect(calls).not.toContain("globalAlpha=0.35");
  });
});

describe("drawing elements", () => {
  it("draws rectangles turned about their centre, ellipses, lines and fills", () => {
    const { ctx, calls } = recorder();
    const draw = (element: Shape) =>
      drawElement(ctx, element, { theme, images: new Map(), cache: new Map() });

    draw(shape("rectangle", { rotation: 1, fill: "ink-yellow" }));
    draw(shape("ellipse"));
    draw(shape("line"));

    expect(calls).toContain("transform(6)");
    expect(calls).toContain("rect(4)");
    expect(calls).toContain("ellipse(7)");
    expect(calls).toContain("lineTo(2)");
    expect(calls.filter((call) => call === "fill(0)")).toHaveLength(1);
    expect(calls.filter((call) => call === "stroke(0)")).toHaveLength(3);
  });

  it("skips a stroke with no outline", () => {
    const { ctx, calls } = recorder();

    drawElement(ctx, stroke("empty", "pen", "a0", { samples: [] }), {
      theme,
      images: new Map(),
      cache: new Map(),
    });

    expect(calls).toEqual([]);
  });

  it("re-outlines a stroke only when its samples change", () => {
    const cache: OutlineCache = new Map();
    const first = stroke("s", "pen", "a0");
    const bounds = cachedBounds(first, cache);

    expect(cachedBounds(first, cache)).toBe(bounds);
    expect(
      cachedBounds({ ...first, samples: [...first.samples, 80, 0, 0.5, 0, 0, 8] }, cache),
    ).not.toBe(bounds);
    expect(cachedBounds(image, cache)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("layers images under highlighter under everything else", () => {
    expect(
      [image, stroke("h", "highlighter", "a0"), stroke("p", "pen", "a0"), shape("line")].map(
        layerOf,
      ),
    ).toEqual([0, 1, 2, 2]);
  });
});

describe("renderPreview", () => {
  it("draws the gesture in progress, clipped to its page, and the lasso loop", () => {
    const { ctx, calls } = recorder();
    const pagesById = layoutById(layoutPages([createPage("a0", "p1")]));

    renderPreview(
      ctx,
      {
        elements: [stroke("onPage", "pen", "a0", { pageId: "p1" }), stroke("free", "pen", "a1")],
        lasso: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
      pagesById,
      options(),
    );

    expect(calls.filter((call) => call === "clip(0)")).toHaveLength(1);
    expect(calls).toContain("closePath(0)");
    expect(calls).toContain("setLineDash(1)");
  });

  it("draws no loop for a lasso of one point", () => {
    const { ctx, calls } = recorder();

    renderPreview(ctx, { elements: [], lasso: [{ x: 0, y: 0 }] }, new Map(), options());

    expect(calls).not.toContain("setLineDash(1)");
  });
});
