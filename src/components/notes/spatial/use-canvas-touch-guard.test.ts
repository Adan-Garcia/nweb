import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCanvasTouchGuard } from "./use-canvas-touch-guard";

function touchStart() {
  return new Event("touchstart", { cancelable: true });
}

describe("useCanvasTouchGuard", () => {
  it("cancels a touch on the canvas so Scribble cannot take the stroke, until unmounted", () => {
    const surface = document.createElement("canvas");
    const { unmount } = renderHook(() => useCanvasTouchGuard({ current: surface }));

    const first = touchStart();
    surface.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);

    unmount();
    const later = touchStart();
    surface.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it("does nothing before the canvas is mounted", () => {
    expect(() => renderHook(() => useCanvasTouchGuard({ current: null }))).not.toThrow();
  });
});
