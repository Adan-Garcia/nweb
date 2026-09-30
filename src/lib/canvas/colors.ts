/**
 * The canvas palette. A stroke stores the token, not a colour, so the same ink stays
 * readable when the theme changes: black ink on paper becomes near-white on a dark theme.
 * A custom colour from the picker is stored as `#rrggbb` and drawn as it is, in every theme.
 */
export const INK_COLORS = [
  "ink-black",
  "ink-blue",
  "ink-red",
  "ink-green",
  "ink-orange",
  "ink-purple",
  "ink-teal",
  "ink-yellow",
] as const;

export type InkColor = (typeof INK_COLORS)[number];

/** Light-theme and dark-theme values. Chosen to read on white paper and on near-black. */
const INK_VALUES: Record<InkColor, { light: string; dark: string }> = {
  "ink-black": { light: "#1f1f1f", dark: "#ececec" },
  "ink-blue": { light: "#1d4ed8", dark: "#7aa2ff" },
  "ink-red": { light: "#dc2626", dark: "#ff7b7b" },
  "ink-green": { light: "#15803d", dark: "#5fd48a" },
  "ink-orange": { light: "#ea580c", dark: "#ffa05c" },
  "ink-purple": { light: "#7e22ce", dark: "#c79bff" },
  "ink-teal": { light: "#0f766e", dark: "#4fd1c5" },
  "ink-yellow": { light: "#ca8a04", dark: "#facc15" },
};

export const CUSTOM_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export function isInkColor(color: string): color is InkColor {
  return INK_COLORS.some((ink) => ink === color);
}

/** The CSS colour to draw `color` with on a light or dark theme. */
export function resolveColor(color: string, dark: boolean): string {
  if (isInkColor(color)) {
    return dark ? INK_VALUES[color].dark : INK_VALUES[color].light;
  }

  return color;
}
