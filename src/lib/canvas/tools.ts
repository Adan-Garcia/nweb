/** The canvas's tools. The eraser has two modes; pressing E again switches between them. */
export const CANVAS_TOOLS = [
  "pen",
  "highlighter",
  "eraser-stroke",
  "eraser-pixel",
  "shape",
  "lasso",
] as const;

export type CanvasTool = (typeof CANVAS_TOOLS)[number];

/** Tools that put marks on the page (or take them off), as opposed to selecting. */
export function isInkTool(tool: CanvasTool): boolean {
  return tool !== "lasso";
}

export function isEraser(tool: CanvasTool): boolean {
  return tool === "eraser-stroke" || tool === "eraser-pixel";
}
