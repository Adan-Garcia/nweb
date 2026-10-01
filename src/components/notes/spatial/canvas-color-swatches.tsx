import { useAppearance } from "@/hooks/use-appearance";
import { INK_COLORS, resolveColor } from "@/lib/canvas/colors";
import { cn } from "@/lib/utils";

const INK_NAMES: Record<(typeof INK_COLORS)[number], string> = {
  "ink-black": "Black",
  "ink-blue": "Blue",
  "ink-red": "Red",
  "ink-green": "Green",
  "ink-orange": "Orange",
  "ink-purple": "Purple",
  "ink-teal": "Teal",
  "ink-yellow": "Yellow",
};

/** The palette. Each swatch shows its ink as the current theme draws it. */
export function CanvasColorSwatches({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (color: string) => void;
}) {
  const { isDark } = useAppearance();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Colour">
      {INK_COLORS.map((ink) => (
        <button
          key={ink}
          type="button"
          aria-label={INK_NAMES[ink]}
          aria-pressed={color === ink}
          title={INK_NAMES[ink]}
          onClick={() => onColorChange(ink)}
          className={cn(
            "size-5 rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
            color === ink && "ring-2 ring-ring ring-offset-1 ring-offset-background",
          )}
          style={{ backgroundColor: resolveColor(ink, isDark) }}
        />
      ))}
    </div>
  );
}
