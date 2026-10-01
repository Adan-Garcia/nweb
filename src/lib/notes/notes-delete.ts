import { getNotesDb } from "../db/notes-db";
import { isReadOnlyKey } from "../keys/access";

/**
 * Tombstones a note and drops its bytes, in one transaction.
 *
 * The directory entry stays as a marker so a future sync can tell "deleted here" from
 * "never created here". The document row and its media do not: a tombstone that kept them
 * would grow IndexedDB forever with content nothing can reach.
 *
 * Media is counted before it is removed. The canvas derives an image's id from its
 * contents, so the same picture dropped into two notes really is one row, and it survives
 * here for as long as another note's scene draws it or a pebble lists it.
 */
export async function softDeleteNote(documentId: string): Promise<boolean> {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["notes-directory", "notes-documents", "notes-media", "pebbles"],
    "readwrite",
  );

  const directoryStore = transaction.objectStore("notes-directory");
  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");

  const entry = await directoryStore.get(documentId);

  // `deletedAt` is absent, not null, on entries written before it existed, so this asks
  // whether it is set rather than comparing it to null.
  // A reader cannot delete what was shared with them; the server would refuse the tombstone.
  if (!entry || entry.deletedAt || isReadOnlyKey(entry.keyId)) {
    await transaction.done;
    return false;
  }

  const documentRecord = await documentStore.get(documentId);
  const doomedMediaIds = (documentRecord?.sceneFiles ?? []).map((sceneFile) => sceneFile.id);

  await documentStore.delete(documentId);

  if (doomedMediaIds.length) {
    const stillReferenced = new Set<string>();

    for (const survivor of await documentStore.getAll()) {
      for (const sceneFile of survivor.sceneFiles) {
        stillReferenced.add(sceneFile.id);
      }
    }

    for (const pebble of await transaction.objectStore("pebbles").getAll()) {
      if (!pebble.deletedAt) {
        stillReferenced.add(pebble.mediaId);
      }
    }

    for (const mediaId of doomedMediaIds) {
      if (!stillReferenced.has(mediaId)) {
        await mediaStore.delete(mediaId);
      }
    }
  }

  const deletedAt = Date.now();
  await directoryStore.put({ ...entry, deletedAt, updatedAt: deletedAt });

  await transaction.done;

  return true;
}
