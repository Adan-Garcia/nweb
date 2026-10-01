import { snapSpacing } from "./backgrounds";
import { elementBounds } from "./element-bounds";
import { type Point, type Rect, rectsIntersect } from "./geometry";
import { pageAt, type PlacedPage, toPagePoint } from "./pages";
import { isPlaced } from "./scene-edits";
import type { PlacedElement, Scene, SceneElement, ShapeKind } from "./scene-model";
import type { InputSample } from "./stroke-geometry";

/** What the current tool draws with. */
export type ToolStyle = {
  color: string;
  width: number;
  /** How much pressure thins a pen's line, 0 to 1. */
  sensitivity: number;
  shapeKind: ShapeKind;
  fill: string | null;
};

/** Everything a gesture reads about the note it is drawing on, at the moment it runs. */
export type GestureContext = {
  scene: Scene;
  pages: readonly PlacedPage[];
  pagesById: ReadonlyMap<string, PlacedPage>;
  style: ToolStyle;
  /** Shift held: shapes are constrained. */
  shift: boolean;
  /** Eraser and hit radius in scene units (a fixed screen size divided by the zoom). */
  radius: number;
  /** The view's zoom, recorded on a stroke so it is smoothed at the scale it was drawn. */
  zoom: number;
  /** The placed elements whose bounds touch `rect`; a spatial index, or a scan. */
  nearby: (rect: Rect) => PlacedElement[];
  newId: () => string;
};

/** A gesture's answer to a move or its end: a new element list, a new selection, or neither. */
export type GestureUpdate = { elements?: SceneElement[]; selection?: string[] };

/** One stroke of a tool, from pointer down to pointer up. */
export type Gesture = {
  /** What touching down did by itself (an eraser erases where it lands). */
  start: GestureUpdate;
  move: (sample: InputSample, context: GestureContext) => GestureUpdate;
  end: (context: GestureContext) => GestureUpdate;
  /** Drawn on the live layer while the gesture runs. */
  preview: () => {
    elements: PlacedElement[];
    hidden: ReadonlySet<string>;
    lasso: Point[] | null;
  };
};

export const NO_PREVIEW = { elements: [], hidden: new Set<string>(), lasso: null };

/** Where a gesture starting at `point` draws: its page in a paged note, or free space. */
export function placeFor(
  context: GestureContext,
  point: Point,
): { pageId?: string; toLocal: (point: Point) => Point; snap: number | null } | null {
  if (context.scene.layout === "infinite") {
    return {
      toLocal: (scenePoint) => scenePoint,
      snap: snapSpacing(context.scene.background ?? "blank"),
    };
  }

  const placed = pageAt(context.pages, point);
  if (!placed) {
    return null;
  }

  return {
    pageId: placed.page.id,
    toLocal: (scenePoint) => toPagePoint(placed, scenePoint),
    snap: snapSpacing(placed.page.background),
  };
}

/** The `nearby` a gesture context uses when no spatial index is at hand: a scan. */
export function scanNearby(
  elements: readonly SceneElement[],
  pagesById: ReadonlyMap<string, PlacedPage>,
): (rect: Rect) => PlacedElement[] {
  return (rect) =>
    elements.filter(isPlaced).filter((element) => {
      const bounds = elementBounds(element, pagesById);

      return bounds !== null && rectsIntersect(bounds, rect);
    });
}

/** A square of `radius` around a point, for asking what is near it. */
export function around(point: Point, radius: number): Rect {
  return { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
}
