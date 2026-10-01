import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getClipboard, setClipboard } from "@/lib/canvas/canvas-clipboard";
import { createPage, createScene, type Scene, type Stroke } from "@/lib/canvas/scene-model";
import type { CanvasTool } from "@/lib/canvas/tools";

import { useCanvasCamera } from "./use-canvas-camera";
import { useCanvasClipboard } from "./use-canvas-clipboard";
import { useCanvasScene } from "./use-canvas-scene";
import { useCanvasShortcuts, useFitView } from "./use-canvas-shortcuts";

const stroke = (id: string, x: number): Stroke => ({
  id,
  version: 1,
  index: "a1",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 100, 100, 0.5, 0, 0, 8],
});

function setup({
  scene = createScene("infinite"),
  tool = "pen" as CanvasTool,
  isReadOnly = false,
  withHost = true,
} = {}) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => DOMRect.fromRect({ width: 400, height: 300 });
  const setTool = vi.fn();
  const onChange = vi.fn();
  const onPasted = vi.fn();
  const hook = renderHook(() => {
    const sceneState = useCanvasScene({ scene, files: new Map() }, onChange);
    const camera = useCanvasCamera({ current: host }, null);
    const fitView = useFitView(sceneState, camera);
    const hostRef = { current: withHost ? host : null };
    const clipboard = useCanvasClipboard({
      hostRef,
      sceneState,
      camera,
      images: new Map(),
      isReadOnly,
      onPasted,
    });
    useCanvasShortcuts({
      hostRef,
      sceneState,
      clipboard,
      tool,
      setTool,
      fitView,
      isReadOnly,
    });
    return { sceneState, camera, fitView };
  });
  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = host) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  return { host, setTool, onChange, onPasted, press, ...hook };
}

describe("useCanvasShortcuts", () => {
  it("picks tools with single keys and leaves other keys to the browser", () => {
    const { press, setTool } = setup();

    expect(press("h").defaultPrevented).toBe(true);
    expect(setTool).toHaveBeenCalledWith("highlighter");
    expect(press("q").defaultPrevented).toBe(false);
  });

  it("ignores keys typed into a field inside the canvas", () => {
    const { host, press, setTool } = setup();
    const field = document.createElement("input");
    host.append(field);

    press("h", {}, field);

    expect(setTool).not.toHaveBeenCalled();
  });

  it("undoes and redoes with the usual chords", () => {
    const { result, press } = setup();
    act(() => result.current.sceneState.commit([stroke("s", 0)]));

    press("z", { ctrlKey: true });
    expect(result.current.sceneState.scene.elements).toEqual([]);
    press("z", { metaKey: true, shiftKey: true });
    expect(result.current.sceneState.scene.elements).toHaveLength(1);
  });

  it("deletes the selection, and nothing when there is none", () => {
    const { result, press, onChange } = setup({
      scene: { ...createScene("infinite"), elements: [stroke("a", 0), stroke("b", 50)] },
    });

    press("Delete");
    expect(onChange).not.toHaveBeenCalled();

    act(() => result.current.sceneState.setSelection(new Set(["a"])));
    press("Backspace");
    expect(result.current.sceneState.scene.elements.map((element) => element.id)).toEqual(["b"]);
    expect(result.current.sceneState.selection.size).toBe(0);
  });

  it("copies the selection, and leaves a paste to the browser's paste event", async () => {
    const { result, press } = setup({
      scene: { ...createScene("infinite"), elements: [stroke("a", 0)] },
    });
    act(() => result.current.sceneState.setSelection(new Set(["a"])));

    expect(press("c", { ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(getClipboard()).not.toBeNull());
    expect(press("v", { ctrlKey: true }).defaultPrevented).toBe(false);
    setClipboard(null);
  });

  it("only fits the view on a note shared to read", () => {
    const { press, setTool, result } = setup({
      isReadOnly: true,
      scene: { ...createScene("infinite"), elements: [stroke("a", 1000)] },
    });

    press("h");
    expect(setTool).not.toHaveBeenCalled();

    press("0");
    expect(result.current.camera.camera.x).toBeGreaterThan(500);
  });

  it("listens to nothing without a host", () => {
    expect(() => setup({ withHost: false })).not.toThrow();
  });
});

describe("useFitView", () => {
  it("frames all the ink on an infinite canvas, and leaves an empty one where it is", () => {
    const empty = setup();
    const before = empty.result.current.camera.camera;
    act(() => empty.result.current.fitView());
    expect(empty.result.current.camera.camera).toEqual(before);

    const { result } = setup({
      scene: { ...createScene("infinite"), elements: [stroke("a", 1000)] },
    });
    act(() => result.current.fitView());
    expect(result.current.camera.camera.zoom).toBe(1);
    expect(result.current.camera.camera.x).toBeCloseTo(1050 - 200);
  });

  it("frames the page in the middle of the view on a paged note, or the first page", () => {
    const paged: Scene = {
      format: 1,
      layout: "paged",
      elements: [createPage("a0", "p1"), createPage("a1", "p2")],
    };
    const { result } = setup({ scene: paged });

    act(() => result.current.camera.setCamera({ x: -200, y: 1500, zoom: 1 }));
    act(() => result.current.fitView());
    // The second page, centred: its middle (y = 1616) sits in the middle of the view.
    expect(result.current.camera.camera.zoom).toBeLessThan(1);
    expect(result.current.camera.camera.y).toBeGreaterThan(500);

    act(() => result.current.camera.setCamera({ x: -200, y: 99999, zoom: 1 }));
    act(() => result.current.fitView());
    expect(result.current.camera.camera.y).toBeLessThan(0);
  });

  it("does nothing on a paged note with no pages", () => {
    const { result } = setup({ scene: { format: 1, layout: "paged", elements: [] } });
    const before = result.current.camera.camera;

    act(() => result.current.fitView());

    expect(result.current.camera.camera).toEqual(before);
  });
});
