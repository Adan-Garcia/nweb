import { presetLabel } from "@/components/notes/spatial/canvas-labels";
import { useAppearance } from "@/hooks/use-appearance";
import { resolveColor } from "@/lib/canvas/colors";
import type { PenPreset } from "@/lib/canvas/pen-settings";
import { cn } from "@/lib/utils";

/** The saved pens, one tap each. Each shows its colour, with a dot as wide as its line. */
export function CanvasPresetButtons({
  presets,
  activeId,
  onApply,
}: {
  presets: readonly PenPreset[];
  activeId: string | null;
  onApply: (preset: PenPreset) => void;
}) {
  const { isDark } = useAppearance();
  if (!presets.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Pen presets">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-label={presetLabel(preset)}
          aria-pressed={preset.id === activeId}
          title={presetLabel(preset)}
          onClick={() => onApply(preset)}
          className={cn(
            "flex size-7 items-center justify-center rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
            preset.id === activeId && "bg-accent ring-2 ring-ring",
          )}
        >
          <span
            aria-hidden
            className={cn("rounded-full", preset.tool === "highlighter" && "opacity-60")}
            style={{
              backgroundColor: resolveColor(preset.color, isDark),
              width: Math.min(18, Math.max(4, preset.width)),
              height: Math.min(18, Math.max(4, preset.width)),
            }}
          />
        </button>
      ))}
    </div>
  );
}
