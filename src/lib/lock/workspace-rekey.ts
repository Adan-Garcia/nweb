import { type Cipher, decryptWith } from "../crypto/cipher";
import { openRow, type SealedRow, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { REKEY_STORES, type RekeyJournal, type RekeyStore } from "./rekey-journal";
import {
  alreadyMoved,
  type CipherPair,
  createRekeyCursor,
  type RekeyCursor,
  type RekeyProgress,
} from "./rekey-sweep";

export type { RekeyProgress } from "./rekey-sweep";

export type RekeySummary = {
  documents: number;
  media: number;
  /** Rows whose display name was rewritten: notes, entities, twigs and pebbles. */
  names: number;
};

/** Every row a rekey will visit, so the progress it reports has a denominator. */
export async function countRekeyRows(): Promise<number> {
  const database = await getNotesDb();
  const counts = await Promise.all(REKEY_STORES.map((store) => database.count(store)));

  return counts.reduce((total, count) => total + count, 0);
}

async function rewriteDocuments(pair: CipherPair, cursor: RekeyCursor): Promise<number> {
  const database = await getNotesDb();
  let rewritten = 0;

  for (const key of await database.getAllKeys("notes-documents")) {
    if (cursor.skips("notes-documents", key)) {
      continue;
    }

    const record = await database.get("notes-documents", key);

    if (!record) {
      continue;
    }

    if (!alreadyMoved(record, pair.to)) {
      const linear = record.linearCompressed
        ? await decryptWith(record.linearCompressed, record, pair.from)
        : null;
      const scene = record.sceneCompressed
        ? await decryptWith(record.sceneCompressed, record, pair.from)
        : null;

      await database.put("notes-documents", {
        ...record,
        linearCompressed: linear ? await pair.to.encrypt(linear) : null,
        sceneCompressed: scene ? await pair.to.encrypt(scene) : null,
        encryption: pair.to.name,
        keyId: pair.to.keyId || undefined,
      });
      rewritten += 1;
    }

    await cursor.advance("notes-documents", key);
  }

  return rewritten;
}

async function rewriteMedia(pair: CipherPair, cursor: RekeyCursor): Promise<number> {
  const database = await getNotesDb();
  let rewritten = 0;

  for (const key of await database.getAllKeys("notes-media")) {
    if (cursor.skips("notes-media", key)) {
      continue;
    }

    const record = await database.get("notes-media", key);

    if (!record) {
      continue;
    }

    if (!alreadyMoved(record, pair.to)) {
      const bytes = new Uint8Array(await record.blob.arrayBuffer());
      const sealed = await pair.to.encrypt(await decryptWith(bytes, record, pair.from));

      await database.put("notes-media", {
        ...record,
        // The blob holds ciphertext once sealed, so it carries no media type of its own;
        // `mimeType` is what it will be when opened, which is what every reader uses.
        blob: new Blob([Uint8Array.from(sealed)], {
          type: pair.to.name === "none" ? record.mimeType : "",
        }),
        encryption: pair.to.name,
        keyId: pair.to.keyId || undefined,
      });
      rewritten += 1;
    }

    await cursor.advance("notes-media", key);
  }

  return rewritten;
}

/**
 * Rewrites one store's display names.
 *
 * Each row is its own transaction — an implicit one, since `put` opens and closes it —
 * because sealing is a non-IndexedDB await and a transaction held across one commits
 * itself. Everything else in the row is left exactly as it was, which is what keeps due
 * dates, statuses and timestamps readable while the title beside them is not.
 */
async function rewriteNames<Key extends string, Row extends Record<Key, string> & SealedRow>(
  store: RekeyStore,
  rows: { key: string; row: Row }[],
  field: Key,
  pair: CipherPair,
  cursor: RekeyCursor,
  put: (row: Row) => Promise<unknown>,
): Promise<number> {
  let rewritten = 0;

  for (const { key, row } of rows) {
    if (cursor.skips(store, key)) {
      continue;
    }

    if (!alreadyMoved(row, pair.to)) {
      await put(await sealRow(await openRow(row, field, pair.from), field, pair.to));
      rewritten += 1;
    }

    await cursor.advance(store, key);
  }

  return rewritten;
}

/** Rows paired with their keys, which is what the cursor is expressed in. */
function keyed<Row extends { id: string }>(rows: Row[]) {
  return rows.map((row) => ({ key: row.id, row }));
}

/**
 * Rewrites every stored payload and every stored name from one cipher to another:
 * plaintext to encrypted when the lock goes on, back again when it comes off, and straight
 * across when the passphrase changes.
 *
 * What this covers is note content — the text, the drawing, the bytes of every image and
 * PDF — and the names the workspace is listed by: note titles, course names, task titles,
 * file names. What it deliberately does not cover is when things happen. A twig's due date
 * and time, its status and every `createdAt` stay readable, so that a server which holds
 * nothing but ciphertext can still tell a device that something is due at nine without
 * being able to say what it is.
 *
 * It is safe to run again on a workspace it was interrupted in: a row it has already moved
 * is recognised and left alone. The journal says where it got to so a resume does not have
 * to walk what it finished; writing and clearing that journal is the caller's job.
 */
export async function rewriteStoredContent({
  from,
  to,
  journal,
  onProgress,
}: {
  from: Cipher;
  to: Cipher;
  journal: RekeyJournal;
  onProgress?: (progress: RekeyProgress) => void;
}): Promise<RekeySummary> {
  const database = await getNotesDb();
  const pair = { from, to };
  const cursor = createRekeyCursor(journal, onProgress);

  const documents = await rewriteDocuments(pair, cursor);
  const media = await rewriteMedia(pair, cursor);

  const names =
    (await rewriteNames(
      "notes-directory",
      keyed(await database.getAll("notes-directory")),
      "feather",
      pair,
      cursor,
      (row) => database.put("notes-directory", row),
    )) +
    (await rewriteNames(
      "wings",
      keyed(await database.getAll("wings")),
      "name",
      pair,
      cursor,
      (row) => database.put("wings", row),
    )) +
    (await rewriteNames(
      "flights",
      keyed(await database.getAll("flights")),
      "name",
      pair,
      cursor,
      (row) => database.put("flights", row),
    )) +
    (await rewriteNames(
      "branches",
      keyed(await database.getAll("branches")),
      "name",
      pair,
      cursor,
      (row) => database.put("branches", row),
    )) +
    (await rewriteNames(
      "nests",
      keyed(await database.getAll("nests")),
      "name",
      pair,
      cursor,
      (row) => database.put("nests", row),
    )) +
    (await rewriteNames(
      "twigs",
      keyed(await database.getAll("twigs")),
      "title",
      pair,
      cursor,
      (row) => database.put("twigs", row),
    )) +
    (await rewriteNames(
      "pebbles",
      keyed(await database.getAll("pebbles")),
      "name",
      pair,
      cursor,
      (row) => database.put("pebbles", row),
    )) +
    // A feed's settings are its address and its rules, sealed as one string.
    (await rewriteNames(
      "feeds",
      keyed(await database.getAll("feeds")),
      "settings",
      pair,
      cursor,
      (row) => database.put("feeds", row),
    )) +
    // A drawing's undo steps hold its strokes, so they move with the rest of the content.
    (await rewriteNames(
      "canvas-history",
      keyed(await database.getAll("canvas-history")),
      "steps",
      pair,
      cursor,
      (row) => database.put("canvas-history", row),
    ));

  return { documents, media, names };
}
