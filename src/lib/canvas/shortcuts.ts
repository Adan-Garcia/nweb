import { type CanvasTool, isEraser } from "./tools";

/** What a key press asks the canvas to do. */
export type CanvasCommand =
  | { type: "tool"; tool: CanvasTool }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "delete" }
  | { type: "fit" };

export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

const TOOL_KEYS: Record<string, CanvasTool> = {
  p: "pen",
  h: "highlighter",
  s: "shape",
  l: "lasso",
};

/**
 * The command for a key press on the canvas, or null. `Ctrl` and `⌘` are the same
 * modifier. The caller skips this while someone is typing in a field.
 */
export function commandForKey(press: KeyPress, currentTool: CanvasTool): CanvasCommand | null {
  const key = press.key.toLowerCase();
  const modifier = press.ctrlKey || press.metaKey;

  if (modifier && !press.altKey) {
    if (key === "z") {
      return { type: press.shiftKey ? "redo" : "undo" };
    }
    if (key === "y") {
      return { type: "redo" };
    }
    if (key === "c") {
      return { type: "copy" };
    }
    if (key === "v") {
      return { type: "paste" };
    }

    return null;
  }

  if (press.altKey || modifier) {
    return null;
  }
  if (key === "delete" || key === "backspace") {
    return { type: "delete" };
  }
  if (key === "0") {
    return { type: "fit" };
  }
  if (key === "e") {
    const tool = currentTool === "eraser-stroke" ? "eraser-pixel" : "eraser-stroke";

    return { type: "tool", tool: isEraser(currentTool) ? tool : "eraser-stroke" };
  }

  const tool = TOOL_KEYS[key];

  return tool ? { type: "tool", tool } : null;
}
