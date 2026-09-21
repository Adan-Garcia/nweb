import { type Cipher, decryptWith } from "./cipher";
import { getNotesDb } from "./notes-db";
import { openRow, type SealedRow, sealRow } from "./sealed-text";

export type RekeySummary = {
  documents: number;
  media: number;
  /** Rows whose display name was rewritten: notes, entities, twigs and pebbles. */
  names: number;
};

/**
 * Rewrites one store's display names from one cipher to another.
 *
 * Each row is its own transaction — an implicit one, since `put` opens and closes it —
 * because sealing is a non-IndexedDB await and a transaction held across one commits
 * itself. Everything else in the row is left exactly as it was, which is what keeps due
 * dates, statuses and timestamps readable while the title beside them is not.
 */
async function rewriteNames<Key extends string, Row extends Record<Key, string> & SealedRow>(
  rows: Row[],
  key: Key,
  { from, to }: { from: Cipher; to: Cipher },
  put: (row: Row) => Promise<unknown>,
): Promise<number> {
  let rewritten = 0;

  for (const row of rows) {
    await put(await sealRow(await openRow(row, key, from), key, to));
    rewritten += 1;
  }

  return rewritten;
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
 * A failure partway through therefore leaves some rows converted; both callers order their
 * work so that the recoverable state is the one the old passphrase still opens.
 */
export async function rewriteStoredContent({
  from,
  to,
}: {
  from: Cipher;
  to: Cipher;
}): Promise<RekeySummary> {
  // Identity, not name: changing the passphrase rewrites AES-GCM to AES-GCM, and comparing
  // the two by name would call that a no-op and leave every row readable only by the key
  // that is about to be thrown away.
  if (from === to) {
    return { documents: 0, media: 0, names: 0 };
  }

  const database = await getNotesDb();
  const documentIds = await database.getAllKeys("notes-documents");
  const mediaIds = await database.getAllKeys("notes-media");

  let documents = 0;
  let media = 0;

  for (const id of documentIds) {
    const record = await database.get("notes-documents", id);

    if (!record) {
      continue;
    }

    const wroteWith = record.encryption ?? "none";
    const linear = record.linearCompressed
      ? await to.encrypt(await decryptWith(record.linearCompressed, wroteWith, from))
      : null;
    const scene = record.sceneCompressed
      ? await to.encrypt(await decryptWith(record.sceneCompressed, wroteWith, from))
      : null;

    await database.put("notes-documents", {
      ...record,
      linearCompressed: linear,
      sceneCompressed: scene,
      encryption: to.name,
    });
    documents += 1;
  }

  for (const id of mediaIds) {
    const record = await database.get("notes-media", id);

    if (!record) {
      continue;
    }

    const wroteWith = record.encryption ?? "none";
    const opened = await decryptWith(
      new Uint8Array(await record.blob.arrayBuffer()),
      wroteWith,
      from,
    );
    const sealed = await to.encrypt(opened);

    await database.put("notes-media", {
      ...record,
      // The blob holds ciphertext once sealed, so it carries no media type of its own;
      // `mimeType` is what it will be when opened, which is what every reader uses.
      blob: new Blob([Uint8Array.from(sealed)], {
        type: to.name === "none" ? record.mimeType : "",
      }),
      encryption: to.name,
    });
    media += 1;
  }

  const pair = { from, to };
  const names =
    (await rewriteNames(await database.getAll("notes-directory"), "feather", pair, (row) =>
      database.put("notes-directory", row),
    )) +
    (await rewriteNames(await database.getAll("wings"), "name", pair, (row) =>
      database.put("wings", row),
    )) +
    (await rewriteNames(await database.getAll("flights"), "name", pair, (row) =>
      database.put("flights", row),
    )) +
    (await rewriteNames(await database.getAll("branches"), "name", pair, (row) =>
      database.put("branches", row),
    )) +
    (await rewriteNames(await database.getAll("nests"), "name", pair, (row) =>
      database.put("nests", row),
    )) +
    (await rewriteNames(await database.getAll("twigs"), "title", pair, (row) =>
      database.put("twigs", row),
    )) +
    (await rewriteNames(await database.getAll("pebbles"), "name", pair, (row) =>
      database.put("pebbles", row),
    ));

  return { documents, media, names };
}
