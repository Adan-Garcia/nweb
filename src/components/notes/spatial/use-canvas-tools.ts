import { useState } from "react";

import type { InkColor } from "@/lib/canvas/colors";
import type { ToolStyle } from "@/lib/canvas/gesture-types";
import type { ShapeKind } from "@/lib/canvas/scene-model";
import type { CanvasTool } from "@/lib/canvas/tools";

/** Which kind of mark each drawing tool keeps its own colour and width for. */
type InkKind = "pen" | "highlighter" | "shape";

const DEFAULTS: Record<InkKind, { color: string; width: number }> = {
  pen: { color: "ink-black" satisfies InkColor, width: 2 },
  highlighter: { color: "ink-yellow" satisfies InkColor, width: 16 },
  shape: { color: "ink-black" satisfies InkColor, width: 2 },
};

export const MIN_WIDTH = 0.5;
export const MAX_WIDTH = 40;

function inkKind(tool: CanvasTool): InkKind {
  return tool === "highlighter" || tool === "shape" ? tool : "pen";
}

/**
 * The toolbar's state: the tool, and a colour and width for each kind of mark, so picking
 * the highlighter does not leave the pen yellow and fat.
 */
export function useCanvasTools() {
  const [tool, setTool] = useState<CanvasTool>("pen");
  const [inks, setInks] = useState(DEFAULTS);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const kind = inkKind(tool);

  const style: ToolStyle = {
    color: inks[kind].color,
    width: inks[kind].width,
    shapeKind,
    fill: null,
  };

  const setColor = (color: string) =>
    setInks((current) => ({ ...current, [kind]: { ...current[kind], color } }));
  const setWidth = (width: number) =>
    setInks((current) => ({
      ...current,
      [kind]: { ...current[kind], width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) },
    }));

  return { tool, setTool, style, setColor, setWidth, shapeKind, setShapeKind };
}

export type CanvasTools = ReturnType<typeof useCanvasTools>;
