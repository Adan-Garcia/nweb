import { FilePlus2, FileUp, Maximize2, Minimize2, Redo2, Undo2 } from "lucide-react";

import { CanvasColorSwatches } from "@/components/notes/spatial/canvas-color-swatches";
import { CanvasPenPanel } from "@/components/notes/spatial/canvas-pen-panel";
import { CanvasPenSettings } from "@/components/notes/spatial/canvas-pen-settings";
import { CanvasPresetButtons } from "@/components/notes/spatial/canvas-preset-buttons";
import { CanvasToolButtons } from "@/components/notes/spatial/canvas-tool-buttons";
import type { CanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { Button } from "@/components/ui/button";

type CanvasToolbarProps = {
  tools: CanvasTools;
  isReadOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Given only for a paged note. */
  onAddPage?: () => void;
  onImportPdf: () => void;
  isImportingPdf: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onColorPicked: (color: string) => void;
};

/** The floating toolbar over the top centre of the canvas. */
export function CanvasToolbar(props: CanvasToolbarProps) {
  const { tools, isReadOnly } = props;
  const icon = (label: string, onClick: () => void, Icon: typeof Undo2, disabled = false) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="size-4" />
    </Button>
  );

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-popover/95 px-2 py-1.5 text-popover-foreground shadow-md backdrop-blur"
    >
      {isReadOnly ? null : (
        <>
          <CanvasToolButtons
            tool={tools.tool}
            shapeKind={tools.shapeKind}
            onToolChange={tools.setTool}
            onShapeKindChange={tools.setShapeKind}
          />
          <CanvasColorSwatches color={tools.style.color} onColorChange={props.onColorPicked} />
          <CanvasPresetButtons
            presets={tools.presets}
            activeId={tools.activePresetId}
            onApply={tools.applyPreset}
          />
          <CanvasPenSettings>
            <CanvasPenPanel tools={tools} />
          </CanvasPenSettings>
          <div className="flex items-center" role="group" aria-label="History">
            {icon("Undo", props.onUndo, Undo2, !props.canUndo)}
            {icon("Redo", props.onRedo, Redo2, !props.canRedo)}
          </div>
          {props.onAddPage ? icon("Add page", props.onAddPage, FilePlus2) : null}
          {icon(
            props.isImportingPdf ? "Importing PDF…" : "Insert PDF",
            props.onImportPdf,
            FileUp,
            props.isImportingPdf,
          )}
        </>
      )}
      {icon(
        props.isFullscreen ? "Exit canvas fullscreen" : "Enter canvas fullscreen",
        props.onToggleFullscreen,
        props.isFullscreen ? Minimize2 : Maximize2,
      )}
    </div>
  );
}
