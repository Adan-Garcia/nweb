import { pageOffset, toElementSpace } from "./element-bounds";
import {
  distance,
  distanceToSegment,
  type Point,
  pointInPolygon,
  rectContains,
  rotatePoint,
} from "./geometry";
import type { PlacedPage } from "./pages";
import type { PlacedElement, Shape, Stroke } from "./scene-model";
import { decodeSamples } from "./stroke-geometry";

/** Whether `point` (in the stroke's space) is within `radius` of its drawn line. */
export function hitsStroke(stroke: Stroke, point: Point, radius: number): boolean {
  const reach = radius + stroke.width / 2;
  const samples = decodeSamples(stroke.samples).map((sample) => ({
    x: stroke.x + sample.x,
    y: stroke.y + sample.y,
  }));

  if (samples.length === 1) {
    return distance(point, samples[0]) <= reach;
  }

  return samples.some(
    (sample, i) => i > 0 && distanceToSegment(point, samples[i - 1], sample) <= reach,
  );
}

/**
 * Whether `point` (in the shape's space) touches it: near its outline, or anywhere inside
 * a filled one. An unfilled box is not hit through its middle, so erasing inside a drawn
 * rectangle does not take the rectangle.
 */
export function hitsShape(shape: Shape, point: Point, radius: number): boolean {
  const reach = radius + shape.strokeWidth / 2;

  if (shape.kind === "line") {
    return (
      distanceToSegment(
        point,
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
      ) <= reach
    );
  }

  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  const local = rotatePoint(point, center, -shape.rotation);
  const halfWidth = Math.abs(shape.width) / 2;
  const halfHeight = Math.abs(shape.height) / 2;
  const dx = local.x - center.x;
  const dy = local.y - center.y;

  if (shape.kind === "rectangle") {
    const outside = Math.max(Math.abs(dx) - halfWidth, Math.abs(dy) - halfHeight);

    return shape.fill !== null ? outside <= reach : Math.abs(outside) <= reach;
  }

  // An ellipse: how far the point is from the outline, measured along its ray from the centre.
  const angle = Math.atan2(dy, dx);
  const edge = Math.hypot(halfWidth * Math.cos(angle), halfHeight * Math.sin(angle));
  const gap = Math.hypot(dx, dy) - edge;

  return shape.fill !== null ? gap <= reach : Math.abs(gap) <= reach;
}

/** What the stroke eraser removes at a scene point: strokes and shapes, never locked ones. */
export function erasableAt(
  candidates: readonly PlacedElement[],
  scenePoint: Point,
  radius: number,
  pagesById: ReadonlyMap<string, PlacedPage>,
): string[] {
  return candidates
    .filter((element) => {
      if (element.locked || element.type === "image") {
        return false;
      }
      const point = toElementSpace(scenePoint, element, pagesById);
      if (!point) {
        return false;
      }

      return element.type === "stroke"
        ? hitsStroke(element, point, radius)
        : hitsShape(element, point, radius);
    })
    .map((element) => element.id);
}

/** The points a lasso judges an element by, in scene space. */
function lassoPoints(element: PlacedElement, offset: Point): Point[] {
  if (element.type === "stroke") {
    return decodeSamples(element.samples).map((sample) => ({
      x: offset.x + element.x + sample.x,
      y: offset.y + element.y + sample.y,
    }));
  }

  return [
    {
      x: offset.x + element.x + element.width / 2,
      y: offset.y + element.y + element.height / 2,
    },
  ];
}

/**
 * What a lasso selects: a stroke when most of it is inside the loop, a shape or image when
 * its centre is. Locked elements are left out.
 */
export function selectedByLasso(
  candidates: readonly PlacedElement[],
  lasso: readonly Point[],
  pagesById: ReadonlyMap<string, PlacedPage>,
): string[] {
  if (lasso.length < 3) {
    return [];
  }

  return candidates
    .filter((element) => {
      const offset = pageOffset(element, pagesById);
      if (element.locked || !offset) {
        return false;
      }
      const points = lassoPoints(element, offset);
      const inside = points.filter((point) => pointInPolygon(point, lasso)).length;

      return inside * 2 >= points.length;
    })
    .map((element) => element.id);
}

/** The topmost image under a scene point, for picking one without a lasso. */
export function imageAt(
  candidates: readonly PlacedElement[],
  scenePoint: Point,
  pagesById: ReadonlyMap<string, PlacedPage>,
): string | null {
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const element = candidates[i];
    const point = toElementSpace(scenePoint, element, pagesById);
    if (element.type === "image" && point && rectContains(element, point)) {
      return element.id;
    }
  }

  return null;
}
