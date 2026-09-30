import { describe, expect, it } from "vitest";

import { INK_COLORS, isInkColor, resolveColor } from "./colors";

describe("resolveColor", () => {
  it("draws a palette ink differently on light and dark themes", () => {
    for (const ink of INK_COLORS) {
      expect(resolveColor(ink, false)).toMatch(/^#[0-9a-f]{6}$/);
      expect(resolveColor(ink, true)).not.toBe(resolveColor(ink, false));
    }
  });

  it("turns black ink light on a dark theme", () => {
    expect(resolveColor("ink-black", false)).toBe("#1f1f1f");
    expect(resolveColor("ink-black", true)).toBe("#ececec");
  });

  it("draws a custom colour as stored, whatever the theme", () => {
    expect(resolveColor("#12ab34", false)).toBe("#12ab34");
    expect(resolveColor("#12ab34", true)).toBe("#12ab34");
  });
});

describe("isInkColor", () => {
  it("knows the palette from anything else", () => {
    expect(isInkColor("ink-teal")).toBe(true);
    expect(isInkColor("#000000")).toBe(false);
    expect(isInkColor("teal")).toBe(false);
  });
});
