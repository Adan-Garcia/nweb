import { getNotesDb } from "./notes-db";
import { type Pebble } from "./pebble-model";

export async function listPebbles(): Promise<Pebble[]> {
  const database = await getNotesDb();
  const rows = await database.getAll("pebbles");

  return rows.filter((pebble) => !pebble.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Records a file. The bytes go to `notes-media` under `mediaId`, which is the same store
 * and the same id a canvas image uses, so a picture dropped into a note and the same
 * picture listed under its branch are one blob rather than two copies of it.
 */
export async function createPebble({
  branchId,
  name,
  blob,
  mediaId,
  nestIds,
  featherId,
}: {
  branchId: string;
  name: string;
  blob: Blob;
  mediaId?: string;
  nestIds?: string[];
  featherId?: string | null;
}): Promise<Pebble> {
  const database = await getNotesDb();
  const now = Date.now();
  const id = mediaId ?? crypto.randomUUID();

  const transaction = database.transaction(["pebbles", "notes-media"], "readwrite");
  const mediaStore = transaction.objectStore("notes-media");
  const existingMedia = await mediaStore.get(id);

  if (!existingMedia) {
    await mediaStore.put({
      id,
      blob,
      mimeType: blob.type,
      created: now,
      updatedAt: now,
    });
  }

  const pebble: Pebble = {
    id: crypto.randomUUID(),
    branchId,
    nestIds: nestIds ?? [],
    name,
    mimeType: blob.type,
    size: blob.size,
    mediaId: id,
    featherId: featherId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await transaction.objectStore("pebbles").put(pebble);
  await transaction.done;

  return pebble;
}

/** Skips the write when this branch already lists the file, so a re-drop is not a second row. */
export async function findPebbleByMediaId(
  branchId: string,
  mediaId: string,
): Promise<Pebble | null> {
  const pebbles = await listPebbles();

  return (
    pebbles.find((pebble) => pebble.branchId === branchId && pebble.mediaId === mediaId) ?? null
  );
}

export async function loadPebbleBlob(pebble: Pebble): Promise<Blob | null> {
  const database = await getNotesDb();
  const media = await database.get("notes-media", pebble.mediaId);

  return media?.blob ?? null;
}

export async function updatePebble(
  id: string,
  changes: Partial<Pick<Pebble, "name" | "nestIds" | "branchId">>,
): Promise<Pebble | null> {
  const database = await getNotesDb();
  const existing = await database.get("pebbles", id);

  if (!existing || existing.deletedAt) {
    return null;
  }

  const next: Pebble = { ...existing, ...changes, updatedAt: Date.now() };
  await database.put("pebbles", next);
  return next;
}

/**
 * Tombstones the file record, and drops the bytes only when nothing else points at them:
 * another pebble in a different branch, or a note whose scene still draws the image.
 */
export async function softDeletePebble(id: string): Promise<boolean> {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["pebbles", "notes-media", "notes-documents"],
    "readwrite",
  );

  const pebbleStore = transaction.objectStore("pebbles");
  const existing = await pebbleStore.get(id);

  if (!existing || existing.deletedAt) {
    await transaction.done;
    return false;
  }

  const deletedAt = Date.now();
  await pebbleStore.put({ ...existing, deletedAt, updatedAt: deletedAt });

  const stillReferenced = (await pebbleStore.getAll()).some(
    (pebble) => !pebble.deletedAt && pebble.mediaId === existing.mediaId,
  );

  const drawnInANote = (await transaction.objectStore("notes-documents").getAll()).some(
    (documentRecord) =>
      documentRecord.sceneFiles.some((sceneFile) => sceneFile.id === existing.mediaId),
  );

  if (!stillReferenced && !drawnInANote) {
    await transaction.objectStore("notes-media").delete(existing.mediaId);
  }

  await transaction.done;
  return true;
}
