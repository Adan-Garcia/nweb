import { type RefObject, useCallback, useEffect, useRef } from "react";

import { readCanvasTheme } from "@/components/notes/spatial/canvas-theme";
import { useAppearance } from "@/hooks/use-appearance";
import type { Camera, Viewport } from "@/lib/canvas/camera";
import type { Point, Rect } from "@/lib/canvas/geometry";
import type { PlacedPage } from "@/lib/canvas/pages";
import type { OutlineCache } from "@/lib/canvas/render-elements";
import { renderPreview, renderScene } from "@/lib/canvas/render-scene";
import type { PlacedElement, Scene } from "@/lib/canvas/scene-model";
import { usePreferencesStore } from "@/stores/use-preferences-store";

type RendererOptions = {
  hostRef: RefObject<HTMLElement | null>;
  sceneCanvasRef: RefObject<HTMLCanvasElement | null>;
  liveCanvasRef: RefObject<HTMLCanvasElement | null>;
  scene: Scene;
  pages: readonly PlacedPage[];
  pagesById: ReadonlyMap<string, PlacedPage>;
  camera: Camera;
  viewport: Viewport;
  images: ReadonlyMap<string, CanvasImageSource>;
  hidden: ReadonlySet<string>;
  selectionBox: Rect | null;
};

/** Sizes a canvas to the viewport in device pixels and returns its 2D context. */
function prepare(canvas: HTMLCanvasElement | null, viewport: Viewport, dpr: number) {
  if (!canvas) {
    return null;
  }

  const width = Math.round(viewport.width * dpr);
  const height = Math.round(viewport.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas.getContext("2d");
}

/**
 * Draws the scene layer whenever what it shows changes (at most once a frame), and hands
 * back `drawLive` for the gesture in progress, which redraws only the live layer above it.
 */
export function useCanvasRenderer(options: RendererOptions) {
  const { isDark } = useAppearance();
  const smoothing = usePreferencesStore((state) => state.preferences.penSmoothing);
  const cacheRef = useRef<OutlineCache>(new Map());
  const frameRef = useRef<number | null>(null);
  const { hostRef, sceneCanvasRef, liveCanvasRef, scene, pages, pagesById, camera, viewport } =
    options;
  const { images, hidden, selectionBox } = options;

  const renderOptions = useCallback(() => {
    const host = hostRef.current;
    const theme = readCanvasTheme(host ?? document.documentElement, isDark);

    return {
      camera,
      viewport,
      dpr: window.devicePixelRatio || 1,
      theme,
      images,
      cache: cacheRef.current,
      smoothing,
    };
  }, [camera, hostRef, images, isDark, smoothing, viewport]);

  useEffect(() => {
    if (!viewport.width || !viewport.height) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const drawing = renderOptions();
      const ctx = prepare(sceneCanvasRef.current, viewport, drawing.dpr);
      if (ctx) {
        renderScene(ctx, scene, pages, { ...drawing, hidden, selection: selectionBox });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hidden, pages, renderOptions, scene, sceneCanvasRef, selectionBox, viewport]);

  const drawLive = useCallback(
    (preview: { elements: readonly PlacedElement[]; lasso: readonly Point[] | null }) => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const drawing = renderOptions();
        const ctx = prepare(liveCanvasRef.current, viewport, drawing.dpr);
        if (ctx) {
          renderPreview(ctx, preview, pagesById, drawing);
        }
      });
    },
    [liveCanvasRef, pagesById, renderOptions, viewport],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return { drawLive };
}
