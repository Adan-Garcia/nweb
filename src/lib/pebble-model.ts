import { z } from "zod";

import { entityBaseSchema } from "./entity-model";

/**
 * A file, as a record of its own. The bytes stay in `notes-media`, keyed by `mediaId`, so
 * a picture dropped on a canvas and the same picture listed under its branch are one blob
 * rather than two copies.
 */
export const pebbleSchema = entityBaseSchema.extend({
  branchId: z.string(),
  nestIds: z.array(z.string()).default([]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  mediaId: z.string(),
  /** The feather it was dropped into, or null for one added straight to the branch. */
  featherId: z.string().nullable().default(null),
});

export type Pebble = z.infer<typeof pebbleSchema>;

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

export function formatPebbleSize(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${unitIndex === 0 ? value : Number(value.toFixed(1))} ${SIZE_UNITS[unitIndex]}`;
}

/** A display name for a dropped file, which arrives with a content-hash id and no name. */
export function buildPebbleName(mimeType: string, created: number) {
  const subtype = mimeType.split("/")[1] ?? "file";
  const stamp = new Date(created).toISOString().slice(0, 10);

  return `${subtype.toUpperCase()} ${stamp}`;
}
