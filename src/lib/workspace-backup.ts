import { loadCalendarEvents, saveCalendarEvents } from "./calendar-storage";
import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentRecord, NotesMediaRecord } from "./notes-model";
import {
  base64ToBytes,
  bytesToBase64,
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_VERSION,
  type WorkspaceBackup,
  workspaceBackupSchema,
} from "./workspace-backup-schema";

function encodeOptional(bytes: Uint8Array | null): string | null {
  return bytes ? bytesToBase64(bytes) : null;
}

/** Reads every store into one plain object that can be written to a file and read back. */
export async function createWorkspaceBackup(now = new Date()): Promise<WorkspaceBackup> {
  const database = await getNotesDb();
  const [directory, documents, media] = await Promise.all([
    database.getAll("notes-directory"),
    database.getAll("notes-documents"),
    database.getAll("notes-media"),
  ]);

  const encodedMedia = await Promise.all(
    media.map(async (record) => ({
      id: record.id,
      data: bytesToBase64(new Uint8Array(await record.blob.arrayBuffer())),
      mimeType: record.mimeType,
      created: record.created,
      updatedAt: record.updatedAt,
    })),
  );

  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: {
      directory,
      documents: documents.map((record) => ({
        ...record,
        linearCompressed: encodeOptional(record.linearCompressed),
        sceneCompressed: encodeOptional(record.sceneCompressed),
      })),
      media: encodedMedia,
    },
    calendar: loadCalendarEvents([]),
  };
}

/** Parses untrusted file contents. Returns the backup, or an error the UI can show as-is. */
export function parseWorkspaceBackup(raw: string): { backup: WorkspaceBackup } | { error: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That file is not valid JSON." };
  }

  const result = workspaceBackupSchema.safeParse(parsed);

  if (!result.success) {
    return { error: "That file is not a Cuervo Planner backup, or it is from a newer version." };
  }

  return { backup: result.data };
}

export type RestoreSummary = {
  notes: number;
  media: number;
  events: number;
};

/**
 * Replaces the workspace with the backup's contents. Everything currently stored is
 * cleared first, so the result is exactly what was exported rather than a merge.
 */
export async function restoreWorkspaceBackup(backup: WorkspaceBackup): Promise<RestoreSummary> {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["notes-directory", "notes-documents", "notes-media"],
    "readwrite",
  );

  const directoryStore = transaction.objectStore("notes-directory");
  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");

  await Promise.all([directoryStore.clear(), documentStore.clear(), mediaStore.clear()]);

  const directory: NotesDirectoryEntry[] = backup.notes.directory;
  const documents: NotesDocumentRecord[] = backup.notes.documents.map((record) => ({
    ...record,
    linearCompressed: record.linearCompressed ? base64ToBytes(record.linearCompressed) : null,
    sceneCompressed: record.sceneCompressed ? base64ToBytes(record.sceneCompressed) : null,
  }));
  const media: NotesMediaRecord[] = backup.notes.media.map((record) => ({
    id: record.id,
    blob: new Blob([base64ToBytes(record.data)], { type: record.mimeType }),
    mimeType: record.mimeType,
    created: record.created,
    updatedAt: record.updatedAt,
  }));

  await Promise.all([
    ...directory.map((entry) => directoryStore.put(entry)),
    ...documents.map((entry) => documentStore.put(entry)),
    ...media.map((entry) => mediaStore.put(entry)),
  ]);

  await transaction.done;

  saveCalendarEvents(backup.calendar);

  return { notes: directory.length, media: media.length, events: backup.calendar.length };
}
