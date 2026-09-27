import { describe, expect, it } from "vitest";

import { accentColor, THEME_BRAND } from "./accent-palettes";
import { contrastRatio, type Oklch, relativeLuminance } from "./color-contrast";
import { ACCENTS, type ResolvedTheme } from "./preferences-model";

const WHITE: Oklch = { l: 1, c: 0, h: 0 };
const BLACK: Oklch = { l: 0, c: 0, h: 0 };

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 3);
    expect(relativeLuminance(BLACK)).toBe(0);
  });

  it("clips a colour outside sRGB rather than going past white", () => {
    expect(relativeLuminance({ l: 1, c: 0.4, h: 140 })).toBeLessThanOrEqual(1);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, whichever way round", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 1);
  });
});

const THEMES: ResolvedTheme[] = ["light", "paper", "dark", "oled"];

describe("every theme and accent", () => {
  for (const theme of THEMES) {
    for (const accent of ACCENTS) {
      const primary = accentColor(accent, theme);

      it(`${theme} × ${accent}: a button's label is readable on it (AA, 4.5:1)`, () => {
        expect(contrastRatio(primary, THEME_BRAND[theme].label)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${theme} × ${accent}: it stands out from the page (3:1)`, () => {
        expect(contrastRatio(primary, THEME_BRAND[theme].page)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
