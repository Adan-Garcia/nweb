import { toElementSpace } from "./element-bounds";
import { distance, type Point } from "./geometry";
import { around, type Gesture, type GestureContext, NO_PREVIEW } from "./gesture-types";
import { erasableAt } from "./hit-test";
import { cutStroke, piecesToStrokes } from "./pixel-erase";
import { indexAbove, removeElements, replaceElement } from "./scene-edits";
import type { SceneElement } from "./scene-model";

/** Points every half radius along a move, so a fast swipe cannot jump over a thin line. */
function along(from: Point, to: Point, radius: number): Point[] {
  const steps = Math.max(1, Math.ceil(distance(from, to) / Math.max(radius / 2, 0.5)));

  return Array.from({ length: steps }, (_, i) => ({
    x: from.x + ((to.x - from.x) * (i + 1)) / steps,
    y: from.y + ((to.y - from.y) * (i + 1)) / steps,
  }));
}

/** The stroke eraser: whole strokes and shapes it touches are removed as it passes. */
export function startStrokeErase(first: Point, context: GestureContext): Gesture {
  let last = first;

  const eraseAt = (points: Point[], at: GestureContext) => {
    const hit = new Set(
      points.flatMap((point) =>
        erasableAt(at.nearby(around(point, at.radius * 2)), point, at.radius, at.pagesById),
      ),
    );

    return hit.size ? { elements: removeElements(at.scene.elements, hit) } : {};
  };
  return {
    start: eraseAt([first], context),
    move: (sample, moveContext) => {
      const points = along(last, sample, moveContext.radius);
      last = sample;

      return eraseAt(points, moveContext);
    },
    end: () => ({}),
    preview: () => NO_PREVIEW,
  };
}

/**
 * The pixel eraser: strokes it crosses are cut, and what is left of each becomes new
 * strokes at the same depth. Shapes and images are left alone; the stroke eraser takes
 * those.
 */
export function startPixelErase(first: Point, context: GestureContext): Gesture {
  let last = first;

  const cut = (from: Point, to: Point, at: GestureContext) => {
    const path = [from, to];
    const reach = around(
      { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      distance(from, to) / 2 + at.radius * 2,
    );
    let elements: SceneElement[] = at.scene.elements;
    let changed = false;

    for (const candidate of at.nearby(reach)) {
      if (candidate.type !== "stroke" || candidate.locked) {
        continue;
      }
      const localPath = path.flatMap(
        (point) => toElementSpace(point, candidate, at.pagesById) ?? [],
      );
      const pieces = cutStroke(candidate, localPath, at.radius);
      if (pieces) {
        const strokes = piecesToStrokes(
          candidate,
          pieces,
          indexAbove(elements, candidate.index),
          at.newId,
        );
        elements = replaceElement(elements, candidate.id, strokes);
        changed = true;
      }
    }

    return changed ? { elements } : {};
  };

  return {
    start: cut(first, first, context),
    move: (sample, moveContext) => {
      const update = cut(last, sample, moveContext);
      last = sample;

      return update;
    },
    end: () => ({}),
    preview: () => NO_PREVIEW,
  };
}
