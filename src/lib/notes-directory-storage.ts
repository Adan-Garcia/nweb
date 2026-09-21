import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentMode, NotesHierarchyLocation } from "./notes-model";

/**
 * Fills in fields added after a row was written. Entries stored before `deletedAt`
 * existed read back with it `undefined`, which is not `null`, so every caller has to
 * normalize here rather than compare against `null` at the far end.
 */
function normalizeEntry(entry: NotesDirectoryEntry): NotesDirectoryEntry {
  return {
    ...entry,
    createdMode: entry.createdMode ?? "linear",
    deletedAt: entry.deletedAt ?? null,
  };
}

function matchesLocation(entry: NotesDirectoryEntry, location: NotesHierarchyLocation) {
  return (
    entry.wing === location.wing &&
    entry.flight === location.flight &&
    entry.branch === location.branch &&
    entry.nest === location.nest &&
    entry.feather === location.feather
  );
}

export async function listNotesDirectoryEntries(): Promise<NotesDirectoryEntry[]> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const entries = rawEntries.map(normalizeEntry).filter((entry) => !entry.deletedAt);

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The live note at this exact path, or null. Ids no longer encode the path, so this is the lookup. */
export async function findNotesDirectoryEntryByLocation(
  location: NotesHierarchyLocation,
): Promise<NotesDirectoryEntry | null> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const match = rawEntries
    .map(normalizeEntry)
    .find((entry) => !entry.deletedAt && matchesLocation(entry, location));

  return match ?? null;
}

/**
 * Creates a note with an id of its own. Ids used to be built from the path, which meant a
 * note could not be renamed or moved and two different paths could slug to one id.
 */
export async function createNotesDirectoryEntry({
  location,
  createdMode,
}: {
  location: NotesHierarchyLocation;
  createdMode?: NotesDocumentMode;
}): Promise<NotesDirectoryEntry> {
  const database = await getNotesDb();
  const now = Date.now();
  const entry: NotesDirectoryEntry = {
    id: crypto.randomUUID(),
    ...location,
    createdMode: createdMode ?? "linear",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await database.put("notes-directory", entry);
  return entry;
}

/** Writes an entry under a caller-chosen id. Only the legacy single-note import needs this. */
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
    deletedAt: existing?.deletedAt ?? null,
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
    ...normalizeEntry(existing),
    createdMode: existing.createdMode ?? fallbackCreatedMode ?? "linear",
    updatedAt: Date.now(),
  });
}
