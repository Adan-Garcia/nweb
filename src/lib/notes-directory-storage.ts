import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentMode } from "./notes-model";

/**
 * Fills in fields added after a row was written. Entries stored before `deletedAt` or
 * `nestIds` existed read back with them `undefined`, which is not `null` or `[]`, so every
 * caller has to normalize here rather than compare at the far end.
 */
function normalizeEntry(entry: NotesDirectoryEntry): NotesDirectoryEntry {
  return {
    ...entry,
    createdMode: entry.createdMode ?? "linear",
    nestIds: entry.nestIds ?? [],
    deletedAt: entry.deletedAt ?? null,
  };
}

export async function listNotesDirectoryEntries(): Promise<NotesDirectoryEntry[]> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const entries = rawEntries.map(normalizeEntry).filter((entry) => !entry.deletedAt);

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The live note with this title in this branch, or null. A title is only unique inside a
 * branch, and nests are tags rather than a level, so they are not part of the lookup.
 */
export async function findNotesDirectoryEntry({
  branchId,
  feather,
}: {
  branchId: string;
  feather: string;
}): Promise<NotesDirectoryEntry | null> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const match = rawEntries
    .map(normalizeEntry)
    .find((entry) => !entry.deletedAt && entry.branchId === branchId && entry.feather === feather);

  return match ?? null;
}

/**
 * Creates a note with an id of its own. Ids used to be built from the path, which meant a
 * note could not be renamed or moved and two different paths could slug to one id.
 */
export async function createNotesDirectoryEntry({
  branchId,
  feather,
  nestIds,
  createdMode,
}: {
  branchId: string;
  feather: string;
  nestIds?: string[];
  createdMode?: NotesDocumentMode;
}): Promise<NotesDirectoryEntry> {
  const database = await getNotesDb();
  const now = Date.now();
  const entry: NotesDirectoryEntry = {
    id: crypto.randomUUID(),
    branchId,
    nestIds: nestIds ?? [],
    feather,
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
  branchId,
  feather,
  nestIds,
  createdMode,
}: {
  id: string;
  branchId: string;
  feather: string;
  nestIds?: string[];
  createdMode?: NotesDocumentMode;
}): Promise<NotesDirectoryEntry> {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", id);

  const nextRecord: NotesDirectoryEntry = {
    id,
    branchId,
    nestIds: nestIds ?? existing?.nestIds ?? [],
    feather,
    createdMode: existing?.createdMode ?? createdMode ?? "linear",
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    deletedAt: existing?.deletedAt ?? null,
  };

  await database.put("notes-directory", nextRecord);
  return nextRecord;
}

/** Renames the note itself. Renaming anything above it is a change to that entity's row. */
export async function renameNotesDirectoryEntry(
  id: string,
  feather: string,
): Promise<NotesDirectoryEntry | null> {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", id);

  if (!existing || existing.deletedAt) {
    return null;
  }

  const next: NotesDirectoryEntry = {
    ...normalizeEntry(existing),
    feather,
    updatedAt: Date.now(),
  };

  await database.put("notes-directory", next);
  return next;
}

/** Replaces the note's tags. Moving a note between branches goes through here too. */
export async function setNotesDirectoryEntryPlacement(
  id: string,
  placement: { branchId?: string; nestIds?: string[] },
): Promise<NotesDirectoryEntry | null> {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", id);

  if (!existing || existing.deletedAt) {
    return null;
  }

  const next: NotesDirectoryEntry = {
    ...normalizeEntry(existing),
    ...placement,
    updatedAt: Date.now(),
  };

  await database.put("notes-directory", next);
  return next;
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
