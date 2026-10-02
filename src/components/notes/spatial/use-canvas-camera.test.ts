import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCanvasCamera } from "./use-canvas-camera";

let resize: (() => void) | null = null;
const disconnect = vi.fn();

class CapturingResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  disconnect = disconnect;
}

function host(width: number, height: number) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => DOMRect.fromRect({ width, height });
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resize = null;
});

describe("useCanvasCamera", () => {
  it("measures the host, opens on the origin, and follows a resize", () => {
    vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
    const element = host(800, 600);
    const { result, unmount } = renderHook(() => useCanvasCamera({ current: element }, null));

    expect(result.current.viewport).toEqual({ width: 800, height: 600 });
    expect(result.current.camera).toEqual({ x: -400, y: -300, zoom: 1 });

    act(() => resize?.());
    expect(result.current.viewport).toEqual({ width: 800, height: 600 });

    element.getBoundingClientRect = () => DOMRect.fromRect({ width: 400, height: 300 });
    act(() => resize?.());
    expect(result.current.viewport).toEqual({ width: 400, height: 300 });

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("opens a paged note on its first page", () => {
    vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
    const page = { x: -408, y: 0, width: 816, height: 1056 };
    const { result } = renderHook(() => useCanvasCamera({ current: host(1000, 800) }, page));

    expect(result.current.camera).toMatchObject({ zoom: 1, y: -24 });
  });

  it("pans, zooms and is set, keeping the ref in step for pointer handlers", () => {
    const { result } = renderHook(() => useCanvasCamera({ current: null }, null));

    act(() => result.current.setCamera({ x: 0, y: 0, zoom: 1 }));
    act(() => result.current.pan(10, -20));
    expect(result.current.camera).toEqual({ x: -10, y: 20, zoom: 1 });

    act(() => result.current.zoom(2, { x: 0, y: 0 }));
    expect(result.current.camera.zoom).toBe(2);
    expect(result.current.cameraRef.current).toEqual(result.current.camera);
  });
});
