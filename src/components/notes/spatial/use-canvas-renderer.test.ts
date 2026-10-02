import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createScene, type Stroke } from "@/lib/canvas/scene-model";

import { useCanvasRenderer } from "./use-canvas-renderer";

/** A canvas whose 2D context records calls; jsdom has no real one. */
function canvas() {
  const element = document.createElement("canvas");
  const context: Partial<CanvasRenderingContext2D> = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    transform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
  };
  // The members the renderer uses, standing in for the browser's large 2D context.
  vi.spyOn(element, "getContext").mockReturnValue(context as CanvasRenderingContext2D);
  return { element, context };
}

const stroke: Stroke = {
  id: "s",
  version: 1,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 30, 0, 0.5, 0, 0, 8],
};

function setup(viewport = { width: 200, height: 100 }, withCanvases = true, withHost = true) {
  const scene = canvas();
  const live = canvas();
  const host = withHost ? document.createElement("div") : null;
  const hook = renderHook(() =>
    useCanvasRenderer({
      hostRef: { current: host },
      sceneCanvasRef: { current: withCanvases ? scene.element : null },
      liveCanvasRef: { current: withCanvases ? live.element : null },
      scene: { ...createScene("infinite"), elements: [stroke] },
      pages: [],
      pagesById: new Map(),
      camera: { x: -100, y: -50, zoom: 1 },
      viewport,
      images: new Map(),
      hidden: new Set(),
      selectionBox: null,
    }),
  );

  return { scene, live, ...hook };
}

afterEach(() => vi.restoreAllMocks());

describe("useCanvasRenderer", () => {
  it("sizes the scene canvas in device pixels and draws the scene on it", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { scene } = setup();

    await waitFor(() => expect(scene.context.fill).toHaveBeenCalled());
    expect(scene.element.width).toBe(400);
    expect(scene.element.height).toBe(200);
    vi.unstubAllGlobals();
  });

  it("keeps a canvas the right size without resizing it, on any screen", async () => {
    vi.stubGlobal("devicePixelRatio", 0);
    const { scene, rerender } = setup(undefined, true, false);
    await waitFor(() => expect(scene.context.fill).toHaveBeenCalled());
    expect(scene.element.width).toBe(200);

    const draws = scene.context.clearRect;
    rerender();
    await waitFor(() => expect(draws).toHaveBeenCalledTimes(2));
    expect(scene.element.width).toBe(200);
    vi.unstubAllGlobals();
  });

  it("draws the live layer on request, once a frame", async () => {
    const { live, result } = setup();

    act(() => {
      result.current.drawLive({ elements: [stroke], lasso: null });
      result.current.drawLive({ elements: [stroke], lasso: null });
    });

    await waitFor(() => expect(live.context.clearRect).toHaveBeenCalledOnce());
    expect(live.context.fill).toHaveBeenCalled();
  });

  it("draws nothing before it has a size, or without canvases", async () => {
    const empty = setup({ width: 0, height: 0 });
    const missing = setup(undefined, false);
    act(() => missing.result.current.drawLive({ elements: [], lasso: null }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(empty.scene.context.clearRect).not.toHaveBeenCalled();
  });

  it("drops a pending live frame when it unmounts", async () => {
    const { live, result, unmount } = setup();

    act(() => result.current.drawLive({ elements: [stroke], lasso: null }));
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(live.context.clearRect).not.toHaveBeenCalled();
  });
});
