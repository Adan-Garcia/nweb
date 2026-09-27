/**
 * WCAG contrast for colours written the way the stylesheet writes them, in OKLCH.
 *
 * The stylesheet builds every accent from a lightness, a chroma and a hue, so whether a
 * button's label is readable is arithmetic on three numbers. This does that arithmetic, so
 * the test beside the stylesheet can check every theme and accent pair instead of trusting
 * that someone looked at all thirty-two.
 */
export type Oklch = { l: number; c: number; h: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Relative luminance (WCAG 2), via OKLab and linear sRGB, clipped to the sRGB gamut. */
export function relativeLuminance({ l, c, h }: Oklch): number {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = clamp(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone);
  const green = clamp(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone);
  const blue = clamp(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: Oklch, second: Oklch): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );

  return (lighter + 0.05) / (darker + 0.05);
}
