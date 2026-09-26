import { type Cipher, decryptWith } from "../cipher";
import { getNotesDb } from "../notes-db";
import { openRow, type SealedRow, sealRow } from "../sealed-text";

/**
 * Moving the rows one key sealed onto a new key, and nothing else.
 *
 * This is not `workspace-rekey.ts`, which moves the whole workspace from one passphrase to
 * another and can assume every row is on the same key. Once objects have keys of their own
 * a database holds rows under several at once, and rotating one of them must leave the rest
 * exactly where they are — a row under a key that is not being rotated is not "stale", it
 * is somebody else's course.
 *
 * The selection is by `keyId`, which every sealed row carries, so it is a comparison rather
 * than an attempt to open each row and see.
 */
export type RotationSummary = { documents: number; media: number; names: number };

const sealedBy = (row: SealedRow, keyId: string) => (row.keyId ?? "") === keyId;

async function rotateDocuments(from: Cipher, to: Cipher, stamp?: number): Promise<number> {
  const database = await getNotesDb();
  let moved = 0;

  for (const key of await database.getAllKeys("notes-documents")) {
    const record = await database.get("notes-documents", key);

    if (!record || !sealedBy(record, from.keyId)) {
      continue;
    }

    const linear = record.linearCompressed
      ? await decryptWith(record.linearCompressed, record, from)
      : null;
    const scene = record.sceneCompressed
      ? await decryptWith(record.sceneCompressed, record, from)
      : null;

    await database.put("notes-documents", {
      ...record,
      linearCompressed: linear ? await to.encrypt(linear) : null,
      sceneCompressed: scene ? await to.encrypt(scene) : null,
      encryption: to.name,
      keyId: to.keyId || undefined,
      ...(stamp === undefined ? {} : { updatedAt: stamp }),
    });
    moved += 1;
  }

  return moved;
}

async function rotateMedia(from: Cipher, to: Cipher, stamp?: number): Promise<number> {
  const database = await getNotesDb();
  let moved = 0;

  for (const key of await database.getAllKeys("notes-media")) {
    const record = await database.get("notes-media", key);

    if (!record || !sealedBy(record, from.keyId)) {
      continue;
    }

    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    const sealed = await to.encrypt(await decryptWith(bytes, record, from));

    await database.put("notes-media", {
      ...record,
      // The blob holds ciphertext, so it carries no media type of its own; `mimeType` is
      // what it will be when opened, which is what every reader uses.
      blob: new Blob([Uint8Array.from(sealed)], {
        type: to.name === "none" ? record.mimeType : "",
      }),
      encryption: to.name,
      keyId: to.keyId || undefined,
      ...(stamp === undefined ? {} : { updatedAt: stamp }),
    });
    moved += 1;
  }

  return moved;
}

/**
 * Rewrites one store's display names.
 *
 * Each row is its own transaction — an implicit one, since `put` opens and closes it —
 * because sealing is a non-IndexedDB await and a transaction held across one commits itself.
 * Everything else in the row is left exactly as it was, which is what keeps due dates,
 * statuses and timestamps readable while the title beside them moves.
 *
 * Taken as rows and a `put` rather than as a store name, for the reason `workspace-rekey.ts`
 * does the same: the stores hold different shapes, and a union of them has no common field.
 */
async function rotateNames<Key extends string, Row extends Record<Key, string> & SealedRow>(
  rows: Row[],
  field: Key,
  from: Cipher,
  to: Cipher,
  put: (row: Row) => Promise<unknown>,
  stamp?: number,
): Promise<number> {
  let moved = 0;

  for (const row of rows) {
    if (!sealedBy(row, from.keyId)) {
      continue;
    }

    const resealed = await sealRow(await openRow(row, field, from), field, to);

    await put(stamp === undefined ? resealed : { ...resealed, updatedAt: stamp });
    moved += 1;
  }

  return moved;
}

/**
 * Rewrites everything this device holds under one key onto another.
 *
 * Run after the new key has been recorded with the server, not before: a device that seals
 * rows under a key nothing else knows about has made them unreadable everywhere but here.
 *
 * `stamp`, when given, becomes every moved row's `updatedAt`. A rotation that other devices
 * and other people must follow passes one, so sync sends the rows again under the new key;
 * without it they would stay on the server under the old key the rotation was meant to
 * retire.
 */
export async function rotateRowsToKey(
  from: Cipher,
  to: Cipher,
  stamp?: number,
): Promise<RotationSummary> {
  const database = await getNotesDb();
  const documents = await rotateDocuments(from, to, stamp);
  const media = await rotateMedia(from, to, stamp);

  const names =
    (await rotateNames(
      await database.getAll("notes-directory"),
      "feather",
      from,
      to,
      (row) => database.put("notes-directory", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("wings"),
      "name",
      from,
      to,
      (row) => database.put("wings", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("flights"),
      "name",
      from,
      to,
      (row) => database.put("flights", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("branches"),
      "name",
      from,
      to,
      (row) => database.put("branches", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("nests"),
      "name",
      from,
      to,
      (row) => database.put("nests", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("twigs"),
      "title",
      from,
      to,
      (row) => database.put("twigs", row),
      stamp,
    )) +
    (await rotateNames(
      await database.getAll("pebbles"),
      "name",
      from,
      to,
      (row) => database.put("pebbles", row),
      stamp,
    )) +
    // The path above a shared thing is sealed under that thing's key, so it moves with it.
    (await rotateNames(
      await database.getAll("share-paths"),
      "path",
      from,
      to,
      (row) => database.put("share-paths", row),
      stamp,
    ));

  return { documents, media, names };
}
