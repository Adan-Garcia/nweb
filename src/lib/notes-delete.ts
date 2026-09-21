import { getNotesDb } from "./notes-db";

/**
 * Tombstones a note and drops its bytes, in one transaction.
 *
 * The directory entry stays as a marker so a future sync can tell "deleted here" from
 * "never created here". The document row and its media do not: a tombstone that kept them
 * would grow IndexedDB forever with content nothing can reach.
 *
 * Media is removed by id without checking whether another note references the same file.
 * Excalidraw derives an image's id from its contents, so the same picture dropped into two
 * notes really does share one row. That is the gap `saveSpatialDocumentPayload` already has
 * when a file leaves a scene; closing it needs a reference count across documents, which is
 * a change of its own rather than a rider on this one.
 */
export async function softDeleteNote(documentId: string): Promise<boolean> {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["notes-directory", "notes-documents", "notes-media"],
    "readwrite",
  );

  const directoryStore = transaction.objectStore("notes-directory");
  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");

  const entry = await directoryStore.get(documentId);

  // `deletedAt` is absent, not null, on entries written before it existed, so this asks
  // whether it is set rather than comparing it to null.
  if (!entry || entry.deletedAt) {
    await transaction.done;
    return false;
  }

  const documentRecord = await documentStore.get(documentId);

  for (const sceneFile of documentRecord?.sceneFiles ?? []) {
    await mediaStore.delete(sceneFile.id);
  }

  await documentStore.delete(documentId);

  const deletedAt = Date.now();
  await directoryStore.put({ ...entry, deletedAt, updatedAt: deletedAt });

  await transaction.done;

  return true;
}
