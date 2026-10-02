import { z } from "zod";

import { CUSTOM_COLOR_PATTERN, INK_COLORS } from "./colors";

/**
 * How someone sets up their pens. Kept apart from the rest of the canvas, which is loaded
 * with the notes page, because the preferences row (which is read for the first paint)
 * stores the presets and the smoothing strength with these bounds.
 */
export const MIN_WIDTH = 0.5;
export const MAX_WIDTH = 40;

/** How much a stroke is smoothed, from 0 (raw) to 1. A setting; this is its default. */
export const DEFAULT_SMOOTHING = 0.5;

/** How much pressure thins a pen's line when the stroke does not say. */
export const DEFAULT_SENSITIVITY = 0.45;

export const MAX_PEN_PRESETS = 6;

const unit = z.number().min(0).max(1);

export const smoothingSchema = unit;

/** A saved pen or highlighter, for one-tap switching. */
export const penPresetSchema = z.object({
  id: z.string().min(1),
  tool: z.enum(["pen", "highlighter"]),
  color: z.union([z.enum(INK_COLORS), z.string().regex(CUSTOM_COLOR_PATTERN)]),
  width: z.number().min(MIN_WIDTH).max(MAX_WIDTH),
  sensitivity: unit,
});

export type PenPreset = z.infer<typeof penPresetSchema>;

/** The presets that read, up to the limit: one a later build wrote differently costs only itself. */
export function readPenPresets(value: unknown): PenPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      const parsed = penPresetSchema.safeParse(item);

      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_PEN_PRESETS);
}
