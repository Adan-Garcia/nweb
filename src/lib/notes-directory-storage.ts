import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentMode } from "./notes-model";
import { openRow, openRows, sealRow } from "./sealed-text";

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

/** Sorted by `updatedAt`, which is never sealed, so the order costs no decrypt at all. */
export async function listNotesDirectoryEntries(): Promise<NotesDirectoryEntry[]> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const entries = await openRows(
    rawEntries.map(normalizeEntry).filter((entry) => !entry.deletedAt),
    "feather",
  );

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The live note with this title in this branch, or null. A title is only unique inside a
 * branch, and nests are tags rather than a level, so they are not part of the lookup.
 *
 * Every candidate is opened before it is compared. A sealed title cannot be matched as
 * stored: AES-GCM takes a fresh IV each time, so the same title seals to different bytes
 * on every write, which is exactly what stops a store of ciphertext being a lookup table.
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
  const candidates = await openRows(
    rawEntries
      .map(normalizeEntry)
      .filter((entry) => !entry.deletedAt && entry.branchId === branchId),
    "feather",
  );

  return candidates.find((entry) => entry.feather === feather) ?? null;
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

  await database.put("notes-directory", await sealRow(entry, "feather"));
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

  await database.put("notes-directory", await sealRow(nextRecord, "feather"));
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
    encryption: undefined,
  };

  await database.put("notes-directory", await sealRow(next, "feather"));
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

  // The title is not part of a move, so the stored row keeps the sealed one it already
  // had and only the copy handed back is opened.
  const next: NotesDirectoryEntry = {
    ...normalizeEntry(existing),
    ...placement,
    updatedAt: Date.now(),
  };

  await database.put("notes-directory", next);
  return openRow(next, "feather");
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
