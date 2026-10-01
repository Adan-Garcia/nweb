import { type Gesture, type GestureContext, NO_PREVIEW, placeFor } from "./gesture-types";
import { indexOnTop } from "./scene-edits";
import type { Shape, Stroke } from "./scene-model";
import { shapeFromDrag } from "./snapping";
import { encodeSamples, type InputSample } from "./stroke-geometry";

/**
 * A pen or highlighter stroke. It belongs to the page it starts on and keeps its samples
 * in that page's space; a stroke started in the gap between pages draws nothing.
 */
export function startInk(
  tool: "pen" | "highlighter",
  first: InputSample,
  context: GestureContext,
): Gesture | null {
  const place = placeFor(context, first);
  if (!place) {
    return null;
  }

  const id = context.newId();
  const local = (sample: InputSample): InputSample => ({ ...sample, ...place.toLocal(sample) });
  const samples = [local(first)];

  const stroke = (): Stroke => {
    const { origin, samples: encoded } = encodeSamples(samples);

    return {
      id,
      version: 1,
      index: indexOnTop(context.scene.elements),
      type: "stroke",
      tool,
      color: context.style.color,
      width: context.style.width,
      x: origin.x,
      y: origin.y,
      samples: encoded,
      ...(place.pageId ? { pageId: place.pageId } : {}),
    };
  };

  return {
    start: {},
    move: (sample) => {
      samples.push(local(sample));

      return {};
    },
    end: (endContext) => ({
      elements: [
        ...endContext.scene.elements,
        { ...stroke(), index: indexOnTop(endContext.scene.elements) },
      ],
    }),
    preview: () => ({ ...NO_PREVIEW, elements: [stroke()] }),
  };
}

/** A shape dragged out from its first point; too small to see when released, it is dropped. */
export function startShape(first: InputSample, context: GestureContext): Gesture | null {
  const place = placeFor(context, first);
  if (!place) {
    return null;
  }

  const id = context.newId();
  const start = place.toLocal(first);
  let end = start;
  let shift = context.shift;

  const shape = (): Shape => ({
    id,
    version: 1,
    index: indexOnTop(context.scene.elements),
    type: "shape",
    kind: context.style.shapeKind,
    ...shapeFromDrag(context.style.shapeKind, start, end, { shift, gridSpacing: place.snap }),
    rotation: 0,
    color: context.style.color,
    strokeWidth: context.style.width,
    fill: context.style.fill,
    ...(place.pageId ? { pageId: place.pageId } : {}),
  });

  return {
    start: {},
    move: (sample, moveContext) => {
      end = place.toLocal(sample);
      shift = moveContext.shift;

      return {};
    },
    end: (endContext) => {
      const made = shape();
      if (Math.abs(made.width) < 2 && Math.abs(made.height) < 2) {
        return {};
      }

      return {
        elements: [
          ...endContext.scene.elements,
          { ...made, index: indexOnTop(endContext.scene.elements) },
        ],
      };
    },
    preview: () => ({ ...NO_PREVIEW, elements: [shape()] }),
  };
}
