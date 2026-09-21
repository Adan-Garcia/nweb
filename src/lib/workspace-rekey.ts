import { type Cipher, decryptWith } from "./cipher";
import { getNotesDb } from "./notes-db";

/**
 * Rewrites every stored payload from one cipher to another: plaintext to encrypted when
 * the lock goes on, and back again when it comes off.
 *
 * What this covers is note content — the text, the drawing, and the bytes of every image
 * and PDF. What it does not cover is the titles and the shape of the workspace: note
 * names, course names, task titles and due dates stay readable. Those live in rows the app
 * lists and sorts, and encrypting them is a change to how every list is read rather than a
 * change to how one payload is written. The UI has to say so rather than implying the
 * whole workspace is sealed.
 *
 * Rows are rewritten one at a time, in their own transaction, because sealing is a
 * non-IndexedDB await and a transaction held across one would commit itself. A failure
 * partway through therefore leaves some rows converted; both callers order their work so
 * that the recoverable state is the readable one.
 */
export async function rewriteStoredContent({
  from,
  to,
}: {
  from: Cipher;
  to: Cipher;
}): Promise<{ documents: number; media: number }> {
  if (from.name === to.name) {
    return { documents: 0, media: 0 };
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

  return { documents, media };
}
