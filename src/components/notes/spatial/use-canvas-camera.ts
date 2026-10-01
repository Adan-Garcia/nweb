import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { type Camera, openingCamera, panBy, type Viewport, zoomAt } from "@/lib/canvas/camera";
import type { Rect } from "@/lib/canvas/geometry";

/**
 * The canvas's view and size. The view is null until the host has been measured, and the
 * opening view is derived from the size until the first pan or zoom sets one.
 * `cameraRef` mirrors it for pointer handlers.
 */
export function useCanvasCamera(hostRef: RefObject<HTMLElement | null>, firstPage: Rect | null) {
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [chosen, setChosen] = useState<Camera | null>(null);
  const camera = chosen ?? openingCamera(firstPage, viewport);
  const cameraRef = useRef(camera);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const measure = () => {
      const { width, height } = host.getBoundingClientRect();
      setViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);

    return () => observer.disconnect();
  }, [hostRef]);

  const setCamera = useCallback((next: Camera | ((current: Camera) => Camera)) => {
    const resolved = typeof next === "function" ? next(cameraRef.current) : next;
    cameraRef.current = resolved;
    setChosen(resolved);
  }, []);

  const pan = useCallback(
    (dx: number, dy: number) => setCamera((current) => panBy(current, dx, dy)),
    [setCamera],
  );

  const zoom = useCallback(
    (factor: number, anchor: { x: number; y: number }) =>
      setCamera((current) => zoomAt(current, factor, anchor)),
    [setCamera],
  );

  return { camera, cameraRef, viewport, setCamera, pan, zoom };
}

export type CanvasCamera = ReturnType<typeof useCanvasCamera>;
