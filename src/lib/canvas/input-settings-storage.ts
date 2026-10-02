import { z } from "zod";

import { getNotesDb } from "../db/notes-db";
import type { InputSettings } from "./input-filter";

/**
 * How this device's pointers draw: whether fingers draw, and stylus-only for a desktop pen
 * tablet. About the device in hand rather than the person (an iPad and a desktop with a
 * tablet want opposite answers), so it is kept here and never synced. Nothing in it is
 * content, so it is not sealed.
 */
const INPUT_SETTINGS_ID = "input";

export const canvasSettingsRecordSchema = z.object({
  id: z.literal(INPUT_SETTINGS_ID),
  fingerDraws: z.union([z.boolean(), z.literal("auto")]),
  stylusOnly: z.boolean(),
});

export type CanvasSettingsRecord = z.infer<typeof canvasSettingsRecordSchema>;

/** Until changed, fingers draw until a pen has been seen, and the mouse draws. */
export const DEFAULT_INPUT_SETTINGS: InputSettings = { fingerDraws: "auto", stylusOnly: false };

export async function readInputSettings(): Promise<InputSettings> {
  const database = await getNotesDb();
  const parsed = canvasSettingsRecordSchema.safeParse(
    await database.get("canvas-settings", INPUT_SETTINGS_ID),
  );

  return parsed.success
    ? { fingerDraws: parsed.data.fingerDraws, stylusOnly: parsed.data.stylusOnly }
    : DEFAULT_INPUT_SETTINGS;
}

export async function saveInputSettings(settings: InputSettings): Promise<void> {
  const database = await getNotesDb();
  await database.put("canvas-settings", { id: INPUT_SETTINGS_ID, ...settings });
}
