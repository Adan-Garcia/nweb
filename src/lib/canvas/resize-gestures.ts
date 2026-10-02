import { pageOffset } from "./element-bounds";
import { distance, type Point, type Rect } from "./geometry";
import { type Gesture, type GestureContext, NO_PREVIEW } from "./gesture-types";
import { isPlaced, scaleElements } from "./scene-edits";
import type { PlacedElement } from "./scene-model";

export const CORNERS = ["nw", "ne", "se", "sw"] as const;

export type Corner = (typeof CORNERS)[number];

/** Smaller than this and a selection could not be found again to make it bigger. */
const MIN_FACTOR = 0.05;

/** Where each corner handle of a selection box sits, in scene space. */
export function cornerPoint(box: Rect, corner: Corner): Point {
  return {
    x: corner === "nw" || corner === "sw" ? box.x : box.x + box.width,
    y: corner === "nw" || corner === "ne" ? box.y : box.y + box.height,
  };
}

const OPPOSITE: Record<Corner, Corner> = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

/** The corner handle within `radius` of `point`, the nearest when two are. */
export function handleAt(box: Rect, point: Point, radius: number): Corner | null {
  let nearest: { corner: Corner; gap: number } | null = null;
  for (const corner of CORNERS) {
    const gap = distance(cornerPoint(box, corner), point);
    if (gap <= radius && (!nearest || gap < nearest.gap)) {
      nearest = { corner, gap };
    }
  }

  return nearest?.corner ?? null;
}

/**
 * How much a drag of `corner` to `point` scales the box, about the corner opposite. One
 * factor for both axes: handwriting stretched one way stops looking like handwriting.
 */
export function resizeFactor(box: Rect, corner: Corner, point: Point): number {
  const anchor = cornerPoint(box, OPPOSITE[corner]);
  const from = cornerPoint(box, corner);
  const along = (axis: "x" | "y") => {
    const span = from[axis] - anchor[axis];

    return span ? (point[axis] - anchor[axis]) / span : 0;
  };

  return Math.max(MIN_FACTOR, along("x"), along("y"));
}

/**
 * Dragging a corner of the selection box. As with a move, the originals are hidden and a
 * scaled copy previewed, and the scene changes once, when the drag ends.
 */
export function startResize(
  box: Rect,
  corner: Corner,
  selection: ReadonlySet<string>,
  context: GestureContext,
): Gesture {
  const anchor = cornerPoint(box, OPPOSITE[corner]);
  const offsetOf = (element: PlacedElement) => pageOffset(element, context.pagesById);
  const resizing = context.scene.elements.filter(
    (element) => isPlaced(element) && selection.has(element.id),
  );
  let factor = 1;

  const scaled = (elements: GestureContext["scene"]["elements"]) =>
    scaleElements(elements, selection, anchor, factor, offsetOf);

  return {
    start: {},
    move: (sample) => {
      factor = resizeFactor(box, corner, sample);

      return {};
    },
    end: (endContext) => (factor === 1 ? {} : { elements: scaled(endContext.scene.elements) }),
    preview: () => ({
      ...NO_PREVIEW,
      elements: scaled(resizing).filter(isPlaced),
      hidden: selection,
    }),
  };
}
