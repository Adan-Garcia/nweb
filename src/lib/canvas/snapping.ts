import type { Point } from "./geometry";
import type { ShapeKind } from "./scene-model";

/** The step a line's angle snaps to with Shift held. */
const ANGLE_STEP = Math.PI / 12;

export function snapToGrid(point: Point, spacing: number): Point {
  return { x: Math.round(point.x / spacing) * spacing, y: Math.round(point.y / spacing) * spacing };
}

/**
 * Where a drag ends once Shift is applied: a line's angle to 15° steps, keeping its length;
 * a rectangle to a square and an ellipse to a circle, the size of the drag's longer side.
 */
export function constrainDrag(kind: ShapeKind, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (kind === "line") {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / ANGLE_STEP) * ANGLE_STEP;

    return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
  }

  const side = Math.max(Math.abs(dx), Math.abs(dy));

  return { x: start.x + side * (Math.sign(dx) || 1), y: start.y + side * (Math.sign(dy) || 1) };
}

export type ShapeGeometry = { x: number; y: number; width: number; height: number };

/**
 * The geometry of a shape drawn by dragging from `start` to `end`. Corners snap to the grid
 * first when there is one, then Shift constrains the result. A rectangle or ellipse is
 * stored by its top-left and a positive size; a line by its start and the vector to its end.
 */
export function shapeFromDrag(
  kind: ShapeKind,
  start: Point,
  end: Point,
  options: { shift: boolean; gridSpacing: number | null },
): ShapeGeometry {
  const { gridSpacing, shift } = options;
  const from = gridSpacing ? snapToGrid(start, gridSpacing) : start;
  const snappedEnd = gridSpacing ? snapToGrid(end, gridSpacing) : end;
  const to = shift ? constrainDrag(kind, from, snappedEnd) : snappedEnd;

  if (kind === "line") {
    return { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y };
  }

  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}
