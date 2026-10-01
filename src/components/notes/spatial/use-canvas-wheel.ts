import { type RefObject, useEffect } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";

/**
 * The wheel pans the canvas; with Ctrl or ⌘ (which is also what a trackpad pinch sends)
 * it zooms about the pointer. A native listener, not a React one: React attaches wheel
 * listeners as passive, and a passive listener cannot stop the page scrolling or the
 * browser zooming instead.
 */
export function useCanvasWheel(surfaceRef: RefObject<HTMLElement | null>, camera: CanvasCamera) {
  const { pan, zoom } = camera;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = surface.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * 0.01), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        pan(-event.deltaX, -event.deltaY);
      }
    };
    surface.addEventListener("wheel", onWheel, { passive: false });

    return () => surface.removeEventListener("wheel", onWheel);
  }, [pan, surfaceRef, zoom]);
}
