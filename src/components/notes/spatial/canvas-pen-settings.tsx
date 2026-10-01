import { type ReactNode, useEffect, useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The button that opens the pen's settings under the toolbar, and the panel itself; what
 * goes in it is the toolbar's to say. Escape or the button again closes it.
 */
export function CanvasPenSettings({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", close);

    return () => document.removeEventListener("keydown", close);
  }, [isOpen]);

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant={isOpen ? "secondary" : "ghost"}
        aria-label="Pen settings"
        title="Pen settings"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <SlidersHorizontal className="size-4" />
      </Button>
      {isOpen ? (
        // Placed against the toolbar, not the button, so it stays centred on a narrow screen.
        <div
          id={panelId}
          role="group"
          aria-label="Pen settings"
          className="absolute top-full left-1/2 mt-2 flex w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-md"
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
