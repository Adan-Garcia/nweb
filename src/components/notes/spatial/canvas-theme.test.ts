import { describe, expect, it } from "vitest";

import { readCanvasTheme } from "./canvas-theme";

describe("readCanvasTheme", () => {
  it("reads the design tokens off the element", () => {
    const element = document.createElement("div");
    element.style.setProperty("--card", "oklch(1 0 0)");
    element.style.setProperty("--muted", "oklch(0.9 0 0)");
    element.style.setProperty("--muted-foreground", "oklch(0.5 0 0)");
    element.style.setProperty("--ring", "oklch(0.6 0.2 25)");
    document.body.append(element);

    expect(readCanvasTheme(element, true)).toEqual({
      dark: true,
      paper: "oklch(1 0 0)",
      gap: "oklch(0.9 0 0)",
      marks: "oklch(0.5 0 0)",
      selection: "oklch(0.6 0.2 25)",
    });
    element.remove();
  });

  it("falls back to system colours where there is no stylesheet", () => {
    expect(readCanvasTheme(document.createElement("div"), false)).toEqual({
      dark: false,
      paper: "Canvas",
      gap: "ButtonFace",
      marks: "GrayText",
      selection: "Highlight",
    });
  });
});
