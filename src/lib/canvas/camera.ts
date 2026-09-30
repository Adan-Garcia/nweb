import { distance, type Point, type Rect } from "./geometry";

/**
 * Where the viewport looks. `x` and `y` are the scene point at its top-left corner and
 * `zoom` is screen pixels per scene unit, so a scene unit is a CSS pixel at 100%.
 */
export type Camera = { x: number; y: number; zoom: number };

export type Viewport = { width: number; height: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function toScene(camera: Camera, screen: Point): Point {
  return { x: screen.x / camera.zoom + camera.x, y: screen.y / camera.zoom + camera.y };
}

export function toScreen(camera: Camera, scene: Point): Point {
  return { x: (scene.x - camera.x) * camera.zoom, y: (scene.y - camera.y) * camera.zoom };
}

/** Moves the view by a drag of `dx`, `dy` screen pixels. */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom };
}

/** Zooms by `factor` while keeping the scene point under `anchor` (screen) where it is. */
export function zoomAt(camera: Camera, factor: number, anchor: Point): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const pinned = toScene(camera, anchor);

  return { zoom, x: pinned.x - anchor.x / zoom, y: pinned.y - anchor.y / zoom };
}

/** The part of the scene the viewport shows. */
export function visibleRect(camera: Camera, viewport: Viewport): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

/**
 * A two-finger gesture: the view the fingers started on, where they started and where they
 * are now. The scene point that was between the fingers stays between them, and the zoom
 * follows how far apart they have moved.
 */
export function pinch(
  start: Camera,
  from: readonly [Point, Point],
  to: readonly [Point, Point],
): Camera {
  const startGap = distance(from[0], from[1]);
  const factor = startGap > 0 ? distance(to[0], to[1]) / startGap : 1;
  const zoom = clampZoom(start.zoom * factor);
  const pinned = toScene(start, midpoint(from[0], from[1]));
  const center = midpoint(to[0], to[1]);

  return { zoom, x: pinned.x - center.x / zoom, y: pinned.y - center.y / zoom };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The view that shows all of `rect` with `padding` screen pixels around it, centred. Never
 * zooms past 100%: fitting a single small stroke should not blow it up to fill the screen.
 */
export function fitRect(rect: Rect, viewport: Viewport, padding = 48): Camera {
  const room = {
    width: Math.max(1, viewport.width - padding * 2),
    height: Math.max(1, viewport.height - padding * 2),
  };
  const zoom = clampZoom(
    Math.min(1, room.width / Math.max(rect.width, 1), room.height / Math.max(rect.height, 1)),
  );

  return {
    zoom,
    x: rect.x + rect.width / 2 - viewport.width / 2 / zoom,
    y: rect.y + rect.height / 2 - viewport.height / 2 / zoom,
  };
}
