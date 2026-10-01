import { Circle, Eraser, Highlighter, Lasso, Minus, Pen, Square } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import type { ShapeKind } from "@/lib/canvas/scene-model";
import { type CanvasTool, isEraser } from "@/lib/canvas/tools";

type ToolButtonsProps = {
  tool: CanvasTool;
  shapeKind: ShapeKind;
  onToolChange: (tool: CanvasTool) => void;
  onShapeKindChange: (kind: ShapeKind) => void;
};

const SHAPE_ICONS: Record<ShapeKind, ComponentType<{ className?: string }>> = {
  rectangle: Square,
  ellipse: Circle,
  line: Minus,
};

const SHAPE_ORDER: ShapeKind[] = ["rectangle", "ellipse", "line"];

/**
 * Pen, highlighter, eraser, shapes and lasso. Pressing the eraser or the shape again cycles
 * through its kinds, as E does from the keyboard.
 */
export function CanvasToolButtons({
  tool,
  shapeKind,
  onToolChange,
  onShapeKindChange,
}: ToolButtonsProps) {
  const ShapeIcon = SHAPE_ICONS[shapeKind];
  const eraserLabel = tool === "eraser-pixel" ? "Pixel eraser" : "Stroke eraser";

  const button = (
    label: string,
    pressed: boolean,
    onClick: () => void,
    Icon: ComponentType<{ className?: string }>,
  ) => (
    <Button
      key={label}
      type="button"
      size="icon"
      variant={pressed ? "default" : "ghost"}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Tools">
      {button("Pen", tool === "pen", () => onToolChange("pen"), Pen)}
      {button(
        "Highlighter",
        tool === "highlighter",
        () => onToolChange("highlighter"),
        Highlighter,
      )}
      {button(
        eraserLabel,
        isEraser(tool),
        () => onToolChange(tool === "eraser-stroke" ? "eraser-pixel" : "eraser-stroke"),
        Eraser,
      )}
      {button(
        `Shape: ${shapeKind}`,
        tool === "shape",
        () => {
          if (tool === "shape") {
            onShapeKindChange(
              SHAPE_ORDER[(SHAPE_ORDER.indexOf(shapeKind) + 1) % SHAPE_ORDER.length],
            );
          }
          onToolChange("shape");
        },
        ShapeIcon,
      )}
      {button("Lasso", tool === "lasso", () => onToolChange("lasso"), Lasso)}
    </div>
  );
}
