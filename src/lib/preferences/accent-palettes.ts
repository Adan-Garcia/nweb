import type { Oklch } from "./color-contrast";
import type { Accent, ResolvedTheme } from "./preferences-model";

/**
 * The numbers `index.css` builds the accent from, in one place a test can reach.
 *
 * The stylesheet cannot import these, so it repeats them: an accent is a hue and a chroma
 * (`[data-accent]`), and a theme decides how light it is and what colour its label is
 * (`[data-theme]`). `color-contrast.test.ts` checks every pair here clears WCAG AA, and
 * `e2e/appearance.spec.ts` reads the stylesheet's computed values in a real browser and
 * checks they are these, so neither copy can drift without a test going red.
 */
export const ACCENT_PALETTE: Record<Accent, { h: number; c: number }> = {
  rose: { h: 16.9, c: 0.2 },
  orange: { h: 45, c: 0.17 },
  amber: { h: 70, c: 0.14 },
  green: { h: 150, c: 0.14 },
  teal: { h: 190, c: 0.11 },
  blue: { h: 250, c: 0.17 },
  indigo: { h: 275, c: 0.19 },
  violet: { h: 300, c: 0.19 },
};

type ThemeBrand = { brandL: number; label: Oklch; page: Oklch };

const DARK_LABEL: Oklch = { l: 0.18, c: 0.01, h: 285.9 };
const LIGHT_LABEL: Oklch = { l: 0.985, c: 0, h: 0 };

export const THEME_BRAND: Record<ResolvedTheme, ThemeBrand> = {
  light: { brandL: 0.52, label: LIGHT_LABEL, page: { l: 1, c: 0, h: 0 } },
  paper: { brandL: 0.51, label: LIGHT_LABEL, page: { l: 0.984, c: 0.006, h: 85 } },
  dark: { brandL: 0.72, label: DARK_LABEL, page: { l: 0.165, c: 0.004, h: 285.9 } },
  oled: { brandL: 0.72, label: DARK_LABEL, page: { l: 0, c: 0, h: 0 } },
};

/** The accent as a colour, at the lightness a theme gives it. */
export function accentColor(accent: Accent, theme: ResolvedTheme): Oklch {
  return { l: THEME_BRAND[theme].brandL, ...ACCENT_PALETTE[accent] };
}
