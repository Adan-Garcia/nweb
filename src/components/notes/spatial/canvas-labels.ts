import { INK_COLORS, isInkColor } from "@/lib/canvas/colors";
import type { PenPreset } from "@/lib/canvas/pen-settings";

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

/** What a colour is called on a button: the ink's name, or a picked colour's hex. */
export function colorName(color: string): string {
  return isInkColor(color) ? INK_NAMES[color] : color.toUpperCase();
}

/** What a preset is called: "Pen: Blue, 2 px". */
export function presetLabel(preset: PenPreset): string {
  const tool = preset.tool === "pen" ? "Pen" : "Highlighter";

  return `${tool}: ${colorName(preset.color)}, ${preset.width} px`;
}
