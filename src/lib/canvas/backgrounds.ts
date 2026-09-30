import type { Point, Rect } from "./geometry";
import type { Background } from "./scene-model";

/**
 * The marks a background is drawn with, for the part of the scene in view. Backgrounds are
 * drawn by the renderer from these and never stored, so changing one rewrites no ink.
 */
export type BackgroundMarks =
  | { kind: "none" }
  | { kind: "dots"; points: Point[] }
  | { kind: "lines"; segments: Array<[Point, Point]> };

/** Spacing in scene units. Dots and grid share it, which is what shapes snap to. */
export const GRID_SPACING = 24;
export const RULED_SPACING = 32;

/** Below this many screen pixels between marks, a pattern is noise and is left out. */
const MIN_SCREEN_SPACING = 6;

/** The grid shapes snap to on this background, or null when it has none. */
export function snapSpacing(background: Background): number | null {
  return background === "dots" || background === "grid" ? GRID_SPACING : null;
}

/** Multiples of `spacing` from the first at or after `from` up to `to`. */
function steps(from: number, to: number, spacing: number): number[] {
  const values: number[] = [];
  for (let value = Math.ceil(from / spacing) * spacing; value <= to; value += spacing) {
    // `+ 0` turns the -0 that Math.ceil gives for small negatives into 0.
    values.push(value + 0);
  }

  return values;
}

/**
 * The marks for `background` over `area` at `zoom`. Marks sit on multiples of the spacing
 * from the origin of whatever space `area` is in (scene space for an infinite note, the
 * page's own space for a page), so the pattern does not slide as the view pans.
 */
export function backgroundMarks(background: Background, area: Rect, zoom: number): BackgroundMarks {
  const spacing = background === "ruled" ? RULED_SPACING : GRID_SPACING;
  if (background === "blank" || spacing * zoom < MIN_SCREEN_SPACING) {
    return { kind: "none" };
  }

  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const rows = steps(area.y, bottom, spacing);

  if (background === "dots") {
    const columns = steps(area.x, right, spacing);

    return { kind: "dots", points: rows.flatMap((y) => columns.map((x) => ({ x, y }))) };
  }

  const horizontal = rows.map((y): [Point, Point] => [
    { x: area.x, y },
    { x: right, y },
  ]);
  if (background === "ruled") {
    return { kind: "lines", segments: horizontal };
  }

  const vertical = steps(area.x, right, spacing).map((x): [Point, Point] => [
    { x, y: area.y },
    { x, y: bottom },
  ]);

  return { kind: "lines", segments: [...horizontal, ...vertical] };
}
