import { startPixelErase, startStrokeErase } from "./erase-gestures";
import type { Gesture, GestureContext } from "./gesture-types";
import { startInk, startShape } from "./ink-gestures";
import { handleAt, startResize } from "./resize-gestures";
import { pressesSelection, selectionBounds, startLasso, startMove } from "./select-gestures";
import type { InputSample } from "./stroke-geometry";
import type { CanvasTool } from "./tools";

/** How far a corner handle reaches, in eraser radii: a fingertip, not a pixel. */
const HANDLE_REACH = 2;

/**
 * The gesture a tool starts with a press at `first` (scene space). Null when the press
 * does nothing: ink or a shape begun off every page of a paged note.
 */
export function startGesture(
  tool: CanvasTool,
  first: InputSample,
  context: GestureContext,
  selection: ReadonlySet<string>,
): Gesture | null {
  switch (tool) {
    case "pen":
    case "highlighter":
      return startInk(tool, first, context);
    case "shape":
      return startShape(first, context);
    case "eraser-stroke":
      return startStrokeErase(first, context);
    case "eraser-pixel":
      return startPixelErase(first, context);
    case "lasso": {
      const box = selection.size ? selectionBounds(context, selection) : null;
      const corner = box && handleAt(box, first, context.radius * HANDLE_REACH);
      if (box && corner) {
        return startResize(box, corner, selection, context);
      }

      return pressesSelection(context, selection, first)
        ? startMove(first, selection, context)
        : startLasso(first);
    }
  }
}
