import { Expand, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SpatialNotesToolbar({
  penWidth,
  isImportingPdf,
  isFullscreen,
  minPenWidth,
  maxPenWidth,
  penWidthStep,
  onPenWidthChange,
  onUploadPdf,
  onToggleFullscreen,
}: {
  penWidth: number;
  isImportingPdf: boolean;
  isFullscreen: boolean;
  minPenWidth: number;
  maxPenWidth: number;
  penWidthStep: number;
  onPenWidthChange: (value: number) => void;
  onUploadPdf: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background/95 px-2 py-1 shadow-sm">
      <label
        htmlFor="notes-pen-width"
        className="text-xs font-medium text-muted-foreground"
      >
        Pen {penWidth.toFixed(2)}
      </label>
      <input
        id="notes-pen-width"
        type="range"
        min={minPenWidth}
        max={maxPenWidth}
        step={penWidthStep}
        value={penWidth}
        onChange={(event) => {
          onPenWidthChange(Number(event.target.value));
        }}
        aria-label="Pen width"
        className="h-1.5 w-28 cursor-pointer accent-foreground"
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUploadPdf}
        disabled={isImportingPdf}
      >
        {isImportingPdf ? "Importing PDF..." : "Insert PDF"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onToggleFullscreen}
        aria-label={
          isFullscreen ? "Exit canvas fullscreen" : "Enter canvas fullscreen"
        }
      >
        {isFullscreen ? (
          <>
            <Minimize className="size-4" />
            Exit Full Screen
          </>
        ) : (
          <>
            <Expand className="size-4" />
            Full Screen
          </>
        )}
      </Button>
    </div>
  );
}
