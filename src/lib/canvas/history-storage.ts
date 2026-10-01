import { cipherNameSchema } from "@shared/cipher-name";
import { z } from "zod";

import { openRow, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { cipherForObject } from "../keys/object-keys";
import { EMPTY_HISTORY, type History, HISTORY_LIMIT } from "./history";
import { sceneElementSchema } from "./scene-model";

/**
 * A note's undo history, kept on this device so it survives closing and reopening the note
 * (`docs/canvas.md`, "Undo history"). It is never synced or backed up: one device's steps
 * mean nothing on another. The steps hold note content, so they are sealed whole, as one
 * string, like a feed's settings.
 */
export const canvasHistoryRecordSchema = z.object({
  /** The note's id. */
  id: z.string().min(1),
  updatedAt: z.number(),
  steps: z.string(),
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
});

export type CanvasHistoryRecord = z.infer<typeof canvasHistoryRecordSchema>;

const changeSchema = z.object({
  id: z.string(),
  before: sceneElementSchema.nullable(),
  after: sceneElementSchema.nullable(),
});
const stepsSchema = z
  .object({ changes: z.array(changeSchema) })
  .array()
  .max(HISTORY_LIMIT);
const historySchema = z.object({ undo: stepsSchema, redo: stepsSchema });

/**
 * The note's saved history, or an empty one: for a note with none, and for one that cannot
 * be read. Losing undo steps costs a convenience and never a note, so unlike a note's own
 * content an unreadable history is forgotten rather than reported.
 */
export async function readCanvasHistory(noteId: string): Promise<History> {
  const database = await getNotesDb();
  const record = canvasHistoryRecordSchema.safeParse(await database.get("canvas-history", noteId));
  if (!record.success) {
    return EMPTY_HISTORY;
  }

  try {
    const opened = await openRow(record.data, "steps");
    const parsed = historySchema.safeParse(JSON.parse(opened.steps) as unknown);

    return parsed.success ? parsed.data : EMPTY_HISTORY;
  } catch {
    return EMPTY_HISTORY;
  }
}

/** Keeps a note's history; an empty one is not kept at all. */
export async function saveCanvasHistory(noteId: string, history: History): Promise<void> {
  if (!history.undo.length && !history.redo.length) {
    await deleteCanvasHistory(noteId);
    return;
  }

  const record: CanvasHistoryRecord = {
    id: noteId,
    updatedAt: Date.now(),
    steps: JSON.stringify(history),
  };
  // Sealed before the store is touched (CLAUDE.md §5), under the workspace's own key: the
  // history is this device's, never shared, whoever the note itself is shared with.
  const sealed = await sealRow(record, "steps", cipherForObject(null));
  const database = await getNotesDb();
  await database.put("canvas-history", sealed);
}

export async function deleteCanvasHistory(noteId: string): Promise<void> {
  const database = await getNotesDb();
  await database.delete("canvas-history", noteId);
}
