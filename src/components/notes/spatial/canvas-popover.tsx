import { type ReactNode, useEffect, useId } from "react";

import { Button } from "@/components/ui/button";

type CanvasPopoverProps = {
  label: string;
  icon: ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/**
 * A toolbar button and the panel it opens under the toolbar; what goes in it is the
 * toolbar's to say. Escape or the button again closes it. Drawn inside the canvas rather
 * than in a portal, so it still shows when the canvas is fullscreen.
 */
export function CanvasPopover({ label, icon, isOpen, onOpenChange, children }: CanvasPopoverProps) {
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", close);

    return () => document.removeEventListener("keydown", close);
  }, [isOpen, onOpenChange]);

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant={isOpen ? "secondary" : "ghost"}
        aria-label={label}
        title={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onOpenChange(!isOpen)}
      >
        {icon}
      </Button>
      {isOpen ? (
        // Placed against the toolbar, not the button, so it stays centred on a narrow screen.
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute top-full left-1/2 mt-2 flex max-h-[min(32rem,calc(100svh-8rem))] w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-md"
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
