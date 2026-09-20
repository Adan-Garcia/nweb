import { getNotesDb } from "./notes-db";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "./notes-model";

export async function listNotesDirectoryEntries(): Promise<
  NotesDirectoryEntry[]
> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const entries = rawEntries.map((entry) => ({
    ...entry,
    createdMode: entry.createdMode ?? "linear",
  }));

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertNotesDirectoryEntry({
  id,
  location,
  createdMode,
}: {
  id: string;
  location: NotesHierarchyLocation;
  createdMode?: NotesDocumentMode;
}): Promise<NotesDirectoryEntry> {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", id);

  const nextRecord: NotesDirectoryEntry = {
    id,
    wing: location.wing,
    flight: location.flight,
    branch: location.branch,
    nest: location.nest,
    feather: location.feather,
    createdMode: existing?.createdMode ?? createdMode ?? "linear",
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  await database.put("notes-directory", nextRecord);
  return nextRecord;
}

export async function touchNotesDirectoryEntry(
  documentId: string,
  fallbackCreatedMode?: NotesDocumentMode,
) {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", documentId);

  if (!existing) {
    return;
  }

  await database.put("notes-directory", {
    ...existing,
    createdMode: existing.createdMode ?? fallbackCreatedMode ?? "linear",
    updatedAt: Date.now(),
  });
}
