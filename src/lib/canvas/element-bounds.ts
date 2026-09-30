import { expandRect, type Point, type Rect, rectFromPoints, rotatePoint } from "./geometry";
import { type PlacedPage } from "./pages";
import type { PlacedElement, Shape } from "./scene-model";
import { strokeBounds } from "./stroke-geometry";

/**
 * Where an element is drawn, in scene space. Strokes, shapes and images store positions
 * relative to their page in a paged note; everything outside `pages.ts` that needs a
 * position on screen goes through here or `toElementSpace`.
 */
export function pageOffset(
  element: Pick<PlacedElement, "pageId">,
  pagesById: ReadonlyMap<string, PlacedPage>,
): Point | null {
  if (!element.pageId) {
    return { x: 0, y: 0 };
  }

  const placed = pagesById.get(element.pageId);

  return placed ? { x: placed.rect.x, y: placed.rect.y } : null;
}

/** A scene point in the space an element's own `x` and `y` are in. */
export function toElementSpace(
  point: Point,
  element: Pick<PlacedElement, "pageId">,
  pagesById: ReadonlyMap<string, PlacedPage>,
): Point | null {
  const offset = pageOffset(element, pagesById);

  return offset ? { x: point.x - offset.x, y: point.y - offset.y } : null;
}

/** The corners of a rectangle or ellipse box, turned by its rotation; a line's two ends. */
export function shapePoints(shape: Shape): Point[] {
  if (shape.kind === "line") {
    return [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ];
  }

  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };

  return [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
    { x: shape.x, y: shape.y + shape.height },
  ].map((corner) => rotatePoint(corner, center, shape.rotation));
}

/** Bounds in the element's own space (page space for an element on a page). */
export function localBounds(element: PlacedElement): Rect {
  switch (element.type) {
    case "stroke":
      return strokeBounds(element);
    case "shape":
      return expandRect(rectFromPoints(shapePoints(element)), element.strokeWidth / 2);
    case "image":
      return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
}

/** Bounds in scene space; null for an element on a page that no longer exists. */
export function elementBounds(
  element: PlacedElement,
  pagesById: ReadonlyMap<string, PlacedPage>,
): Rect | null {
  const offset = pageOffset(element, pagesById);
  if (!offset) {
    return null;
  }

  const rect = localBounds(element);

  return { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
}
