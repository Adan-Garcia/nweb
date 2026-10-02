import type { CanvasTheme } from "@/lib/canvas/render-elements";

/**
 * The canvas's colours, read from the design tokens on the element it is mounted in, so a
 * 2D context (which cannot use CSS variables) still follows the theme. The fallbacks are
 * CSS system colours, for an environment with no stylesheet.
 */
export function readCanvasTheme(element: Element, dark: boolean): CanvasTheme {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    dark,
    paper: token("--card", "Canvas"),
    gap: token("--muted", "ButtonFace"),
    marks: token("--muted-foreground", "GrayText"),
    selection: token("--ring", "Highlight"),
  };
}
