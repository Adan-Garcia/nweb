import { PRINT_THEME } from "@/lib/canvas/export-scene";
import type { Rect } from "@/lib/canvas/geometry";
import type { PlacedPage } from "@/lib/canvas/pages";
import { renderScene } from "@/lib/canvas/render-scene";
import type { Scene } from "@/lib/canvas/scene-model";

/** Browsers refuse canvases much past this on a side (iPad Safari first). */
const MAX_SIDE = 8192;

export type RasterOptions = {
  images: ReadonlyMap<string, CanvasImageSource>;
  /** White under everything, for a format with no transparency or a page to print. */
  opaque: boolean;
};

/**
 * Draws `region` of a scene onto a new canvas at `pixelsPerUnit`, in the print theme,
 * shrinking the scale rather than asking for a canvas the browser will not make.
 */
export function rasterize(
  scene: Scene,
  pages: readonly PlacedPage[],
  region: Rect,
  pixelsPerUnit: number,
  { images, opaque }: RasterOptions,
): HTMLCanvasElement {
  const scale = Math.min(pixelsPerUnit, MAX_SIDE / region.width, MAX_SIDE / region.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  renderScene(ctx, scene, pages, {
    camera: { x: region.x, y: region.y, zoom: 1 },
    viewport: { width: region.width, height: region.height },
    dpr: scale,
    theme: PRINT_THEME,
    images,
    cache: new Map(),
  });
  if (opaque) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = PRINT_THEME.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

/** The canvas encoded as `type`; null where the browser cannot encode it. */
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
}
