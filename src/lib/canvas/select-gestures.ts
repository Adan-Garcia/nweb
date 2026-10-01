import { elementBounds } from "./element-bounds";
import { type Point, type Rect, rectContains, unionRects } from "./geometry";
import { type Gesture, type GestureContext, NO_PREVIEW } from "./gesture-types";
import { selectedByLasso } from "./hit-test";
import { isPlaced, translateElements } from "./scene-edits";
import type { PlacedElement } from "./scene-model";

/** The box around a selection in scene space, or null when nothing selected can be placed. */
export function selectionBounds(
  context: Pick<GestureContext, "scene" | "pagesById">,
  selection: ReadonlySet<string>,
): Rect | null {
  return unionRects(
    context.scene.elements
      .filter(isPlaced)
      .filter((element) => selection.has(element.id))
      .flatMap((element) => elementBounds(element, context.pagesById) ?? []),
  );
}

/** The lasso: a loop drawn freehand, selecting what it closes around when released. */
export function startLasso(first: Point): Gesture {
  const path = [first];

  return {
    start: { selection: [] },
    move: (sample) => {
      path.push({ x: sample.x, y: sample.y });

      return {};
    },
    end: (context) => ({
      selection: selectedByLasso(context.scene.elements.filter(isPlaced), path, context.pagesById),
    }),
    preview: () => ({ ...NO_PREVIEW, lasso: [...path] }),
  };
}

/**
 * Dragging a selection. Elements move in their own space by the drag's distance, so ink on
 * a page stays on that page. The originals are hidden and moved copies previewed until the
 * drag ends, then moved once: a drag is one change, not one per pointer event.
 */
export function startMove(
  first: Point,
  selection: ReadonlySet<string>,
  context: GestureContext,
): Gesture {
  let offset = { x: 0, y: 0 };
  const moving = context.scene.elements.filter(
    (element): element is PlacedElement => isPlaced(element) && selection.has(element.id),
  );

  return {
    start: {},
    move: (sample) => {
      offset = { x: sample.x - first.x, y: sample.y - first.y };

      return {};
    },
    end: (endContext) =>
      offset.x || offset.y
        ? { elements: translateElements(endContext.scene.elements, selection, offset.x, offset.y) }
        : {},
    preview: () => ({
      elements: moving.map((element) => ({
        ...element,
        x: element.x + offset.x,
        y: element.y + offset.y,
      })),
      hidden: selection,
      lasso: null,
    }),
  };
}

/** Whether a lasso-tool press lands on the current selection, which drags it. */
export function pressesSelection(
  context: Pick<GestureContext, "scene" | "pagesById">,
  selection: ReadonlySet<string>,
  point: Point,
): boolean {
  const bounds = selection.size ? selectionBounds(context, selection) : null;

  return bounds !== null && rectContains(bounds, point);
}
