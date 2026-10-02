import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useElementFullscreen } from "./use-element-fullscreen";

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: element });
}

function fakeElement() {
  const element = document.createElement("section");
  const requestFullscreen = vi.fn(() => {
    setFullscreenElement(element);
    return Promise.resolve();
  });
  Object.defineProperty(element, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
  return { element, requestFullscreen };
}

afterEach(() => setFullscreenElement(null));

describe("useElementFullscreen", () => {
  it("requests fullscreen for the element and follows the browser's fullscreenchange event", async () => {
    const { element, requestFullscreen } = fakeElement();
    const { result } = renderHook(() => useElementFullscreen({ current: element }));
    expect(result.current.isFullscreen).toBe(false);

    await act(async () => {
      await result.current.toggleFullscreen();
    });
    expect(requestFullscreen).toHaveBeenCalledOnce();

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("exits fullscreen when the element is already fullscreen", async () => {
    const { element } = fakeElement();
    setFullscreenElement(element);
    const exitFullscreen = vi.fn(() => {
      setFullscreenElement(null);
      return Promise.resolve();
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    const { result } = renderHook(() => useElementFullscreen({ current: element }));

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("is not fullscreen when a different element is", () => {
    const { element } = fakeElement();
    const { result } = renderHook(() => useElementFullscreen({ current: element }));

    setFullscreenElement(document.body);
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(false);
  });

  it("does nothing without an element", async () => {
    const empty = renderHook(() => useElementFullscreen({ current: null }));
    await act(async () => {
      await empty.result.current.toggleFullscreen();
    });

    expect(empty.result.current.isFullscreen).toBe(false);
  });

  it("covers the window instead when the browser refuses, until toggled back", async () => {
    const { element, requestFullscreen } = fakeElement();
    requestFullscreen.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useElementFullscreen({ current: element }));

    await act(async () => {
      await result.current.toggleFullscreen();
    });
    expect(result.current).toMatchObject({ isFullscreen: true, isCovering: true });

    await act(async () => {
      await result.current.toggleFullscreen();
    });
    expect(result.current).toMatchObject({ isFullscreen: false, isCovering: false });
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("covers the window where there is no fullscreen API, and Escape leaves it", async () => {
    const element = document.createElement("section");
    Object.defineProperty(element, "requestFullscreen", { configurable: true, value: undefined });
    const { result } = renderHook(() => useElementFullscreen({ current: element }));

    await act(async () => {
      await result.current.toggleFullscreen();
    });
    expect(result.current.isCovering).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(result.current.isCovering).toBe(true);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isCovering).toBe(false);
  });

  it("stops listening when unmounted", () => {
    const { element } = fakeElement();
    const remove = vi.spyOn(document, "removeEventListener");
    renderHook(() => useElementFullscreen({ current: element })).unmount();
    expect(remove).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });
});
