import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  type Cipher,
  type CipherName,
  CipherUnavailableError,
  decryptWith,
  getActiveCipher,
} from "./cipher";

/**
 * The cipher seam for the one short string a row is listed and sorted by: a note's title,
 * a course name, a task title, a file name.
 *
 * These are not payloads. They live in the row itself, which the app reads with `getAll()`
 * and filters in JS, so sealing them costs a decrypt per row on every list rather than an
 * index. That is the whole reason this was a decision and not a detail: the content seam
 * changes how one blob is written, and this one changes how every list is read.
 *
 * What is deliberately *not* sealed is anything a server would need to act on without
 * being able to read the workspace — a twig's `dueDate` and `dueTime` above all, so that
 * push notifications ("something is due at nine") remain possible against a store that
 * holds only ciphertext titles. Status, kind and the timestamps stay readable for the same
 * reason. A date is not the secret; what the thing is called is.
 *
 * The sealed value goes back into the same field as base64, so no row grows a column and
 * no schema stops being a string. The row's `encryption` marker says which cipher wrote
 * it, exactly as `NotesDocumentRecord.encryption` does for content.
 */
export type SealedRow = { encryption?: CipherName };

export async function sealText(text: string, cipher: Cipher = getActiveCipher()): Promise<string> {
  if (cipher.name === "none") {
    return text;
  }

  return bytesToBase64(await cipher.encrypt(new TextEncoder().encode(text)));
}

/**
 * Reads a name back with whatever wrote it. A row sealed by a cipher that is not active
 * throws, for the reason `decryptWith` does: handing the UI base64 would put it in a list,
 * and the next rename would write it back as the name.
 */
export async function openText(
  stored: string,
  wroteWith: CipherName | undefined,
  cipher: Cipher = getActiveCipher(),
): Promise<string> {
  if (!wroteWith || wroteWith === "none") {
    return stored;
  }

  // Checked before the base64 is decoded, so "this workspace is locked" is not reported as
  // "that is not valid base64" for a row some other key wrote.
  if (cipher.name !== wroteWith) {
    throw new CipherUnavailableError(wroteWith);
  }

  return new TextDecoder().decode(await decryptWith(base64ToBytes(stored), wroteWith, cipher));
}

/**
 * Seals a row's display field and stamps it, in one place so no storage module can seal
 * the text and forget the marker. `key` is the one field that carries a name, which is
 * `name`, `title` or `feather` depending on the store.
 */
export async function sealRow<Key extends string, Row extends Record<Key, string> & SealedRow>(
  row: Row,
  key: Key,
  cipher: Cipher = getActiveCipher(),
): Promise<Row> {
  return {
    ...row,
    [key]: await sealText(row[key], cipher),
    // No marker on a plaintext row: "absent" is what every row written before this reads
    // as, and one spelling of "readable" is easier to reason about than two.
    encryption: cipher.name === "none" ? undefined : cipher.name,
  };
}

/**
 * The inverse. Rows leave a storage module in plaintext and with no marker on them, so
 * that a caller which writes one back — a tombstone, a restore — stores a readable name
 * that says it is readable, rather than plaintext labelled as ciphertext.
 */
export async function openRow<Key extends string, Row extends Record<Key, string> & SealedRow>(
  row: Row,
  key: Key,
  cipher: Cipher = getActiveCipher(),
): Promise<Row> {
  return {
    ...row,
    [key]: await openText(row[key], row.encryption, cipher),
    encryption: undefined,
  };
}

export function sealRows<Key extends string, Row extends Record<Key, string> & SealedRow>(
  rows: Row[],
  key: Key,
  cipher: Cipher = getActiveCipher(),
): Promise<Row[]> {
  return Promise.all(rows.map((row) => sealRow(row, key, cipher)));
}

export function openRows<Key extends string, Row extends Record<Key, string> & SealedRow>(
  rows: Row[],
  key: Key,
  cipher: Cipher = getActiveCipher(),
): Promise<Row[]> {
  return Promise.all(rows.map((row) => openRow(row, key, cipher)));
}
