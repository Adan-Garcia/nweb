import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasCamera } from "./use-canvas-camera";
import { useCanvasWheel } from "./use-canvas-wheel";

function fakeCamera() {
  const pan = vi.fn();
  const zoom = vi.fn();
  const view = { x: 0, y: 0, zoom: 1 };
  const camera: CanvasCamera = {
    camera: view,
    cameraRef: { current: view },
    viewport: { width: 100, height: 100 },
    setCamera: vi.fn(),
    pan,
    zoom,
  };

  return { camera, pan, zoom };
}

function setup() {
  const surface = document.createElement("div");
  surface.getBoundingClientRect = () => DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 100 });
  const { camera, pan, zoom } = fakeCamera();
  const hook = renderHook(() => useCanvasWheel({ current: surface }, camera));

  return { surface, pan, zoom, ...hook };
}

describe("useCanvasWheel", () => {
  it("pans with the wheel and zooms about the pointer with Ctrl, never scrolling the page", () => {
    const { surface, pan, zoom } = setup();

    const scroll = new WheelEvent("wheel", { deltaX: 3, deltaY: 7, cancelable: true });
    surface.dispatchEvent(scroll);
    expect(pan).toHaveBeenCalledWith(-3, -7);
    expect(scroll.defaultPrevented).toBe(true);

    surface.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, clientX: 60, clientY: 70 }),
    );
    expect(zoom).toHaveBeenCalledWith(Math.exp(1), { x: 50, y: 50 });
  });

  it("stops listening when it unmounts, and needs a surface to listen on", () => {
    const { surface, pan, unmount } = setup();
    unmount();
    surface.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
    expect(pan).not.toHaveBeenCalled();

    expect(() =>
      renderHook(() => useCanvasWheel({ current: null }, fakeCamera().camera)),
    ).not.toThrow();
  });
});
