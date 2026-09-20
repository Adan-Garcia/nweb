import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MAX_PEN_WIDTH, MIN_PEN_WIDTH } from "./spatial-notes-editor-utils";
import { useExcalidrawPen } from "./use-excalidraw-pen";

// A minimal stand-in for Excalidraw's large imperative API.
function fakeApi(strokeWidth = 2) {
  const unsubscribe = vi.fn();
  let notify: (appState: { currentItemStrokeWidth: number }) => void = () => {};
  const api = {
    getAppState: vi.fn(() => ({ currentItemStrokeWidth: strokeWidth })),
    updateScene: vi.fn(),
    onChange: vi.fn(
      (callback: (elements: unknown, appState: { currentItemStrokeWidth: number }) => void) => {
        notify = (appState) => callback([], appState);
        return unsubscribe;
      },
    ),
  } as unknown as ExcalidrawImperativeAPI;
  return { api, unsubscribe, notify: (width: number) => notify({ currentItemStrokeWidth: width }) };
}

describe("useExcalidrawPen", () => {
  it("starts at the default width", () => {
    expect(renderHook(() => useExcalidrawPen()).result.current.penWidth).toBe(1);
  });

  it("adopts the canvas's current pen width when the API arrives, and pushes it back", () => {
    const { result } = renderHook(() => useExcalidrawPen());
    const { api } = fakeApi(3);

    act(() => result.current.handleExcalidrawApi(api));

    expect(result.current.penWidth).toBe(3);
    expect(api.updateScene).toHaveBeenCalledWith({ appState: { currentItemStrokeWidth: 3 } });
    expect(result.current.excalidrawApiRef.current).toBe(api);
  });

  it("clamps requested widths and applies them to the canvas", () => {
    const { result } = renderHook(() => useExcalidrawPen());
    const { api } = fakeApi();
    act(() => result.current.handleExcalidrawApi(api));

    act(() => result.current.applyPenWidth(100));
    expect(result.current.penWidth).toBe(MAX_PEN_WIDTH);
    expect(api.updateScene).toHaveBeenLastCalledWith({
      appState: { currentItemStrokeWidth: MAX_PEN_WIDTH },
    });

    act(() => result.current.applyPenWidth(-5));
    expect(result.current.penWidth).toBe(MIN_PEN_WIDTH);
  });

  it("updates the toolbar when the pen width changes on the canvas", () => {
    const { result } = renderHook(() => useExcalidrawPen());
    const { api, notify } = fakeApi(2);
    act(() => result.current.handleExcalidrawApi(api));

    act(() => notify(5));

    expect(result.current.penWidth).toBe(5);
  });

  it("only updates the local width without an API to talk to", () => {
    const { result } = renderHook(() => useExcalidrawPen());
    act(() => result.current.applyPenWidth(4));
    expect(result.current.penWidth).toBe(4);
  });

  it("drops the previous subscription when a new API arrives, and on unmount", () => {
    const { result, unmount } = renderHook(() => useExcalidrawPen());
    const first = fakeApi();
    const second = fakeApi();

    act(() => result.current.handleExcalidrawApi(first.api));
    act(() => result.current.handleExcalidrawApi(second.api));
    expect(first.unsubscribe).toHaveBeenCalledOnce();

    unmount();
    expect(second.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.excalidrawApiRef.current).toBeNull();
  });
});
