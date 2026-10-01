import { Palette } from "lucide-react";

import { colorName } from "@/components/notes/spatial/canvas-labels";
import { useAppearance } from "@/hooks/use-appearance";
import { INK_COLORS, isInkColor, resolveColor } from "@/lib/canvas/colors";
import { cn } from "@/lib/utils";

/**
 * The palette, each swatch showing its ink as the current theme draws it, and a picker for
 * any other colour. A picked colour is kept as it is and does not follow the theme.
 */
export function CanvasColorSwatches({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (color: string) => void;
}) {
  const { isDark } = useAppearance();
  const isCustom = !isInkColor(color);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Colour">
      {INK_COLORS.map((ink) => (
        <button
          key={ink}
          type="button"
          aria-label={colorName(ink)}
          aria-pressed={color === ink}
          title={colorName(ink)}
          onClick={() => onColorChange(ink)}
          className={cn(
            "size-5 rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
            color === ink && "ring-2 ring-ring ring-offset-1 ring-offset-background",
          )}
          style={{ backgroundColor: resolveColor(ink, isDark) }}
        />
      ))}
      {/* The native picker, invisible over a palette icon (or the picked colour, once there is one). */}
      <label
        title="Custom colour"
        className={cn(
          "relative flex size-5 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground focus-within:ring-2 focus-within:ring-ring",
          isCustom && "ring-2 ring-ring ring-offset-1 ring-offset-background",
        )}
        style={isCustom ? { backgroundColor: color } : undefined}
      >
        {isCustom ? null : <Palette aria-hidden className="size-3.5" />}
        <input
          type="color"
          aria-label="Custom colour"
          value={resolveColor(color, isDark)}
          onChange={(event) => onColorChange(event.currentTarget.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
