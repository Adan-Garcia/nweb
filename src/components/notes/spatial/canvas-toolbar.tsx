import { type ReactNode, useCallback, useState } from "react";
import { Ellipsis, Maximize2, Minimize2, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";

import { CanvasColorSwatches } from "@/components/notes/spatial/canvas-color-swatches";
import { CanvasPenPanel } from "@/components/notes/spatial/canvas-pen-panel";
import { CanvasPopover } from "@/components/notes/spatial/canvas-popover";
import { CanvasPresetButtons } from "@/components/notes/spatial/canvas-preset-buttons";
import { CanvasToolButtons } from "@/components/notes/spatial/canvas-tool-buttons";
import type { CanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CanvasToolbarProps = {
  tools: CanvasTools;
  isReadOnly: boolean;
  /** A phone: colours and presets move into the pen panel, so the toolbar is one row. */
  isCompact?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onColorPicked: (color: string) => void;
  /** What the "More" panel holds; handed `close` to shut it after an action. */
  more?: (close: () => void) => ReactNode;
};

type Panel = "pen" | "more" | null;

/** The floating toolbar over the top centre of the canvas. */
export function CanvasToolbar(props: CanvasToolbarProps) {
  const { tools, isReadOnly, isCompact = false } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const opener = useCallback(
    (which: Exclude<Panel, null>) => (open: boolean) => setPanel(open ? which : null),
    [],
  );
  const close = useCallback(() => setPanel(null), []);
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
  const colours = (
    <>
      <CanvasColorSwatches color={tools.style.color} onColorChange={props.onColorPicked} />
      <CanvasPresetButtons
        presets={tools.presets}
        activeId={tools.activePresetId}
        onApply={tools.applyPreset}
      />
    </>
  );

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className={cn(
        "absolute inset-x-0 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center justify-center rounded-2xl border border-border bg-popover/95 px-2 py-1.5 text-popover-foreground shadow-md backdrop-blur",
        isCompact ? "flex-nowrap gap-0.5 px-1 [&_[data-slot=button]]:size-8" : "flex-wrap gap-2",
      )}
    >
      {isReadOnly ? null : (
        <>
          <CanvasToolButtons
            tool={tools.tool}
            shapeKind={tools.shapeKind}
            onToolChange={tools.setTool}
            onShapeKindChange={tools.setShapeKind}
          />
          {isCompact ? null : colours}
          <CanvasPopover
            label="Pen settings"
            icon={<SlidersHorizontal className="size-4" />}
            isOpen={panel === "pen"}
            onOpenChange={opener("pen")}
          >
            {isCompact ? <div className="flex flex-wrap items-center gap-2">{colours}</div> : null}
            <CanvasPenPanel tools={tools} />
          </CanvasPopover>
          <div className="flex items-center" role="group" aria-label="History">
            {icon("Undo", props.onUndo, Undo2, !props.canUndo)}
            {icon("Redo", props.onRedo, Redo2, !props.canRedo)}
          </div>
        </>
      )}
      {isCompact
        ? null
        : icon(
            props.isFullscreen ? "Exit canvas fullscreen" : "Enter canvas fullscreen",
            props.onToggleFullscreen,
            props.isFullscreen ? Minimize2 : Maximize2,
          )}
      {props.more ? (
        <CanvasPopover
          label="More"
          icon={<Ellipsis className="size-4" />}
          isOpen={panel === "more"}
          onOpenChange={opener("more")}
        >
          {props.more(close)}
        </CanvasPopover>
      ) : null}
    </div>
  );
}
