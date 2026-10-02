import { ClipboardPaste, Copy, Trash2 } from "lucide-react";

import type { CanvasClipboard } from "@/components/notes/spatial/use-canvas-clipboard";
import { Button } from "@/components/ui/button";

/**
 * Copy, paste and delete for the lasso, along the bottom of the canvas: on a tablet there
 * is no keyboard to press them with.
 */
export function CanvasSelectionBar({ clipboard }: { clipboard: CanvasClipboard }) {
  const action = (label: string, Icon: typeof Copy, onClick: () => void, enabled: boolean) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
    >
      <Icon className="size-4" />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit items-center gap-1 rounded-2xl border border-border bg-popover/95 px-2 py-1 text-popover-foreground shadow-md backdrop-blur"
    >
      {action("Copy", Copy, () => void clipboard.copy(), clipboard.canCopy)}
      {action("Paste", ClipboardPaste, clipboard.paste, clipboard.canPaste)}
      {action("Delete", Trash2, clipboard.remove, clipboard.canCopy)}
    </div>
  );
}
