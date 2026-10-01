import { useEffect, useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InputSettings } from "@/lib/canvas/input-filter";
import { createPage, createScene, type Scene, type Stroke } from "@/lib/canvas/scene-model";
import type { CanvasTool } from "@/lib/canvas/tools";

import { type CanvasCamera, useCanvasCamera } from "./use-canvas-camera";
import { useCanvasPointer } from "./use-canvas-pointer";
import { type CanvasSceneState, useCanvasScene } from "./use-canvas-scene";

type Kind = "pen" | "touch" | "mouse";
type Press = { id?: number; kind?: Kind; button?: number; x: number; y: number; t?: number };
type Point = { x: number; y: number };

/**
 * A real pointer event, carrying the browser's coalesced samples when given. `null` is a
 * browser without `getCoalescedEvents` at all.
 */
function pointer(type: string, press: Press, coalesced?: Point[] | null) {
  const { id = 1, kind = "pen", button = 0, x, y, t = 1000 } = press;
  const init = {
    pointerId: id,
    pointerType: kind,
    button,
    clientX: x,
    clientY: y,
    pressure: 0.5,
    bubbles: true,
  };
  const event = new PointerEvent(type, init);
  Object.defineProperty(event, "timeStamp", { value: t });
  if (coalesced === null) {
    Object.defineProperty(event, "getCoalescedEvents", { value: undefined });
  } else if (coalesced) {
    const samples = coalesced.map(
      (point) => new PointerEvent(type, { ...init, clientX: point.x, clientY: point.y }),
    );
    Object.defineProperty(event, "getCoalescedEvents", { value: () => samples });
  }
  return event;
}

const ink: Stroke = {
  id: "ink",
  version: 1,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: -10,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 20, 0, 0.5, 0, 0, 8],
};

const AUTO: InputSettings = { fingerDraws: "auto", stylusOnly: false };

function setup(
  options: {
    scene?: Scene;
    tool?: CanvasTool;
    settings?: InputSettings;
    isReadOnly?: boolean;
  } = {},
) {
  const { scene = createScene("infinite"), tool = "pen", settings = AUTO } = options;
  const isReadOnly = options.isReadOnly ?? false;
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ width: 400, height: 300 }),
  );
  const drawLive = vi.fn();
  const setHidden = vi.fn();
  const state: { current: { sceneState: CanvasSceneState; camera: CanvasCamera } | null } = {
    current: null,
  };

  function Harness() {
    const surfaceRef = useRef<HTMLCanvasElement | null>(null);
    const sceneState = useCanvasScene({ scene, files: new Map() }, vi.fn());
    const camera = useCanvasCamera(surfaceRef, null);
    const handlers = useCanvasPointer({
      surfaceRef,
      sceneState,
      camera,
      tool,
      style: { color: "ink-blue", width: 2, shapeKind: "rectangle", fill: null },
      settings,
      isReadOnly,
      drawLive,
      setHidden,
    });
    useEffect(() => {
      state.current = { sceneState, camera };
    });
    return <canvas ref={surfaceRef} aria-label="surface" {...handlers} />;
  }

  render(<Harness />);
  const surface = screen.getByLabelText("surface");
  const fire = (type: string, press: Press, coalesced?: Point[] | null) =>
    act(() => {
      fireEvent(surface, pointer(type, press, coalesced));
    });

  return {
    down: (press: Press) => fire("pointerdown", press),
    move: (press: Press, coalesced?: Point[] | null) => fire("pointermove", press, coalesced),
    up: (press: Press) => fire("pointerup", press),
    elements: () => state.current?.sceneState.scene.elements ?? [],
    view: () => state.current?.camera.camera,
    selection: () => state.current?.sceneState.selection,
    drawLive,
    setHidden,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("useCanvasPointer", () => {
  it("draws a pen stroke from every coalesced sample and saves it on lift", () => {
    const { down, move, up, elements, drawLive, setHidden } = setup();

    down({ x: 200, y: 150 });
    move({ x: 220, y: 150, t: 8 }, [
      { x: 210, y: 150 },
      { x: 220, y: 150 },
    ]);
    move({ x: 240, y: 160, t: 16 });
    expect(drawLive).toHaveBeenCalled();
    expect(elements()).toEqual([]);

    up({ x: 240, y: 160, t: 20 });
    const [stroke] = elements();
    expect(stroke).toMatchObject({ type: "stroke", x: 0, y: 0, color: "ink-blue" });
    expect(stroke.type === "stroke" && stroke.samples.length).toBe(4 * 6);
    expect(setHidden).toHaveBeenLastCalledWith(new Set());
  });

  it("takes one sample per event where the browser coalesces none", () => {
    const { down, move, up, elements } = setup();

    down({ x: 200, y: 150 });
    move({ x: 220, y: 150, t: 8 }, null);
    up({ x: 220, y: 150, t: 9 });

    const [stroke] = elements();
    expect(stroke.type === "stroke" && stroke.samples.length).toBe(2 * 6);
  });

  it("keeps a finger's stroke when the second finger comes too late to be a pinch", () => {
    const { down, move, up, elements, view } = setup();

    down({ id: 1, kind: "touch", x: 100, y: 100, t: 1000 });
    move({ id: 1, kind: "touch", x: 140, y: 100, t: 1050 });
    down({ id: 2, kind: "touch", x: 300, y: 100, t: 1500 });
    move({ id: 1, kind: "touch", x: 120, y: 100, t: 1520 });
    // The fingers were 160 apart when the pinch began (the first had moved to 140), now 180.
    expect(view()?.zoom).toBeCloseTo(180 / 160);
    up({ id: 1, kind: "touch", x: 120, y: 100, t: 1530 });
    up({ id: 2, kind: "touch", x: 300, y: 100, t: 1530 });

    expect(elements()).toHaveLength(1);
  });

  it("pans with the middle mouse button", () => {
    const { down, move, up, view } = setup();

    down({ kind: "mouse", button: 1, x: 100, y: 100 });
    move({ kind: "mouse", x: 130, y: 90 });
    up({ kind: "mouse", x: 130, y: 90 });

    expect(view()).toMatchObject({ x: -230, y: -140 });
  });

  it("pans with any press on a note shared to read", () => {
    const { down, move, up, view, elements } = setup({ isReadOnly: true });

    down({ x: 100, y: 100 });
    move({ x: 90, y: 100 });
    up({ x: 90, y: 100 });

    expect(view()?.x).toBe(-190);
    expect(elements()).toEqual([]);
  });

  it("pinches with two fingers, throwing away the stroke the first had just begun", () => {
    const { down, move, up, view, elements } = setup();

    down({ id: 1, kind: "touch", x: 100, y: 100, t: 1000 });
    move({ id: 1, kind: "touch", x: 105, y: 100, t: 1010 });
    down({ id: 2, kind: "touch", x: 200, y: 100, t: 1040 });
    move({ id: 2, kind: "touch", x: 300, y: 100, t: 1060 });
    expect(view()?.zoom).toBeCloseTo(195 / 95);

    up({ id: 2, kind: "touch", x: 300, y: 100, t: 1070 });
    up({ id: 1, kind: "touch", x: 105, y: 100, t: 1070 });
    expect(elements()).toEqual([]);
  });

  it("ignores a palm while the pen hovers, and pans with a finger once a pen is known", () => {
    const { down, move, up, view, elements } = setup();

    move({ kind: "pen", x: 50, y: 50, t: 1000 });
    down({ id: 7, kind: "touch", x: 100, y: 100, t: 1100 });
    move({ id: 7, kind: "touch", x: 150, y: 100, t: 1150 });
    expect(view()?.x).toBe(-200);
    up({ id: 7, kind: "touch", x: 150, y: 100, t: 1160 });

    down({ id: 8, kind: "touch", x: 100, y: 100, t: 5000 });
    move({ id: 8, kind: "touch", x: 150, y: 100, t: 5010 });
    expect(view()?.x).toBe(-250);
    expect(elements()).toEqual([]);
  });

  it("lets nothing else start while a gesture runs, and ignores others' moves and lifts", () => {
    const { down, move, up, elements } = setup();

    down({ x: 200, y: 150 });
    down({ id: 9, kind: "mouse", x: 10, y: 10 });
    down({ id: 10, kind: "mouse", button: 2, x: 10, y: 10 });
    move({ id: 9, kind: "mouse", x: 20, y: 20 });
    up({ id: 9, kind: "mouse", x: 20, y: 20 });
    expect(elements()).toEqual([]);

    up({ x: 200, y: 150 });
    expect(elements()).toHaveLength(1);
  });

  it("selects with the lasso", () => {
    const { down, move, up, selection } = setup({
      scene: { ...createScene("infinite"), elements: [ink] },
      tool: "lasso",
    });

    down({ x: 180, y: 140 });
    move({ x: 230, y: 140 });
    move({ x: 230, y: 160 });
    move({ x: 180, y: 160 });
    up({ x: 180, y: 160 });

    expect(selection()).toEqual(new Set(["ink"]));
  });

  it("erases where the stroke eraser lands", () => {
    const { down, up, elements } = setup({
      scene: { ...createScene("infinite"), elements: [ink] },
      tool: "eraser-stroke",
    });

    down({ x: 200, y: 150 });
    expect(elements()).toEqual([]);
    up({ x: 200, y: 150 });
  });

  it("starts nothing for a stroke begun between the pages of a paged note", () => {
    const paged: Scene = { format: 1, layout: "paged", elements: [createPage("a0", "p")] };
    const { down, up, elements, drawLive } = setup({ scene: paged });

    down({ x: 200, y: 5 });
    up({ x: 200, y: 5 });

    expect(elements()).toHaveLength(1);
    expect(drawLive).not.toHaveBeenCalled();
  });
});
