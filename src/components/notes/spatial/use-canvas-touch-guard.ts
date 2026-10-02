import { type RefObject, useEffect } from "react";

/**
 * Keeps the system's own touch handling off the canvas. On an iPad, Scribble reads Pencil
 * strokes that come in quick succession as handwriting and takes them over, cancelling
 * the pointer events mid-stroke; a double tap is also still read as a zoom. Cancelling
 * `touchstart` stops both, and pointer events, which the canvas draws from, still arrive.
 * A native listener: React attaches touch listeners as passive, and those cannot cancel.
 */
export function useCanvasTouchGuard(surfaceRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const onTouchStart = (event: TouchEvent) => event.preventDefault();
    surface.addEventListener("touchstart", onTouchStart, { passive: false });

    return () => surface.removeEventListener("touchstart", onTouchStart);
  }, [surfaceRef]);
}
