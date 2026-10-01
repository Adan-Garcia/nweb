import { startPixelErase, startStrokeErase } from "./erase-gestures";
import type { Gesture, GestureContext } from "./gesture-types";
import { startInk, startShape } from "./ink-gestures";
import { pressesSelection, startLasso, startMove } from "./select-gestures";
import type { InputSample } from "./stroke-geometry";
import type { CanvasTool } from "./tools";

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
    case "lasso":
      return pressesSelection(context, selection, first)
        ? startMove(first, selection, context)
        : startLasso(first);
  }
}
