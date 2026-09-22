import { decryptWith, getActiveCipher } from "./cipher";
import { getNotesDb } from "./notes-db";
import { type Pebble } from "./pebble-model";
import { openRow, openRows, sealRow } from "./sealed-text";

/** A file's name is sealed like every other; its type, size and dates are not. */
export async function listPebbles(): Promise<Pebble[]> {
  const database = await getNotesDb();
  const rows = await database.getAll("pebbles");
  const live = await openRows(
    rows.filter((pebble) => !pebble.deletedAt),
    "name",
  );

  return live.sort((a, b) => b.createdAt - a.createdAt);
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

  // Everything that needs the cipher happens before the transaction opens: awaiting
  // anything that is not an IndexedDB request lets the transaction auto-commit, and the
  // puts below would then fail with TransactionInactiveError in a real browser.
  const cipher = getActiveCipher();
  const sealedPebble = await sealRow(pebble, "name");
  const sealedBlob =
    cipher.name === "none"
      ? blob
      : new Blob([Uint8Array.from(await cipher.encrypt(new Uint8Array(await blob.arrayBuffer())))]);

  const transaction = database.transaction(["pebbles", "notes-media"], "readwrite");
  const mediaStore = transaction.objectStore("notes-media");
  const existingMedia = await mediaStore.get(id);

  if (!existingMedia) {
    await mediaStore.put({
      id,
      blob: sealedBlob,
      // The stored blob holds ciphertext once sealed, so `mimeType` is what it will be
      // when opened rather than what the blob itself carries — as in the scene path.
      mimeType: blob.type,
      created: now,
      updatedAt: now,
      encryption: cipher.name,
      keyId: cipher.keyId || undefined,
    });
  }

  await transaction.objectStore("pebbles").put(sealedPebble);
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

/** Opened with whatever sealed it, so a caller gets the file and not its ciphertext. */
export async function loadPebbleBlob(pebble: Pebble): Promise<Blob | null> {
  const database = await getNotesDb();
  const media = await database.get("notes-media", pebble.mediaId);

  if (!media) {
    return null;
  }

  if ((media.encryption ?? "none") === "none") {
    return media.blob;
  }

  const opened = await decryptWith(new Uint8Array(await media.blob.arrayBuffer()), media);

  return new Blob([Uint8Array.from(opened)], { type: media.mimeType });
}

export async function updatePebble(
  id: string,
  changes: Partial<Pick<Pebble, "name" | "nestIds" | "branchId">>,
): Promise<Pebble | null> {
  const database = await getNotesDb();
  const stored = await database.get("pebbles", id);

  if (!stored || stored.deletedAt) {
    return null;
  }

  const existing = await openRow(stored, "name");
  const next: Pebble = { ...existing, ...changes, updatedAt: Date.now() };

  await database.put("pebbles", await sealRow(next, "name"));
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
