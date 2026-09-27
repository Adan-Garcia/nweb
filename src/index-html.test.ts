import { describe, expect, it } from "vitest";

import {
  ACCENTS,
  DEFAULT_PREFERENCES,
  DENSITIES,
  FONT_SIZES,
  THEME_MODES,
} from "@/lib/preferences/preferences-model";

// The one file outside `src/` the app ships as written; there is no alias above `src/`.
import script from "../index.html?raw";

/**
 * `index.html` paints the cached look before any bundle loads, so it cannot import the
 * schema and repeats its allowlists instead. This keeps the two from drifting: a value the
 * schema adds and the script does not know would be painted as the default, and one the
 * schema drops would still be painted.
 */
function listNamed(name: string): string[] {
  const match = new RegExp(`var ${name} = \\[([^\\]]*)\\]`).exec(script);

  return (match?.[1] ?? "").split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

describe("the boot script in index.html", () => {
  it("allows exactly the values the preferences schema does", () => {
    expect(listNamed("themes")).toEqual([...THEME_MODES]);
    expect(listNamed("accents")).toEqual([...ACCENTS]);
    expect(listNamed("densities")).toEqual([...DENSITIES]);
    expect(listNamed("fontSizes")).toEqual([...FONT_SIZES]);
  });

  it("falls back to the schema's defaults", () => {
    expect(script).toContain(`pick(prefs.theme, themes, "${DEFAULT_PREFERENCES.theme}")`);
    expect(script).toContain(`pick(prefs.accent, accents, "${DEFAULT_PREFERENCES.accent}")`);
    expect(script).toContain(`pick(prefs.density, densities, "${DEFAULT_PREFERENCES.density}")`);
    expect(script).toContain(`pick(prefs.fontSize, fontSizes, "${DEFAULT_PREFERENCES.fontSize}")`);
  });
});
