import { cipherNameSchema } from "@shared/cipher-name";
import type { SyncStore } from "@shared/sync-contract";
import { z } from "zod";

import { type Cipher, type CipherMarker, decryptWith } from "../cipher";
import { cipherForObject } from "../keys/object-keys";
import { openText, sealText } from "../sealed-text";
import { compressText, decompressText } from "../text-compression";
import { mergeScenes } from "./merge-scene";
import { mergeFields, mergeHtml, type Side } from "./three-way";

/**
 * Merging two stored versions of one row: opening what is sealed, handing the plaintext to
 * `three-way.ts`, and sealing the result again under the row's own key.
 *
 * Every row here is in the form it is stored in — a note's body compressed and sealed, a
 * name sealed — because that is how it comes off the wire and out of IndexedDB. Two
 * sealings of the same text never compare equal (each has its own IV), so nothing can be
 * compared until it is open.
 */
export type StoredRecord = Record<string, unknown>;

/**
 * The one sealed field each store is listed by. A document has two bodies instead, and the
 * preferences have none: nothing in them is sealed at rest.
 */
const DISPLAY_FIELDS: Record<Exclude<SyncStore, "notes-documents">, string | null> = {
  "notes-directory": "feather",
  wings: "name",
  flights: "name",
  branches: "name",
  nests: "name",
  twigs: "title",
  pebbles: "name",
  "share-paths": "path",
  preferences: null,
};

/** Never merged as content: they say how and when a row was written, not what is in it. */
const BOOKKEEPING = new Set(["updatedAt", "encryption", "keyId"]);

function markerOf(row: StoredRecord): CipherMarker {
  const encryption = cipherNameSchema.safeParse(row.encryption);

  return {
    encryption: encryption.success ? encryption.data : undefined,
    keyId: typeof row.keyId === "string" && row.keyId ? row.keyId : undefined,
  };
}

/**
 * The key the merged row is sealed under, or null when this device does not hold it.
 *
 * The newer side's key, because a rotation moves a row forward and never back. Falling back
 * to the workspace's own key here would re-seal somebody else's note under a key they do
 * not have — so a key this device cannot produce ends the merge instead.
 */
function cipherFor(local: StoredRecord, remote: StoredRecord): Cipher | null {
  const keyId = markerOf(remote).keyId ?? markerOf(local).keyId;
  const cipher = cipherForObject(keyId);

  return keyId && cipher.keyId !== keyId ? null : cipher;
}

async function openBody(row: StoredRecord, prefix: "linear" | "scene"): Promise<string | null> {
  const bytes = row[`${prefix}Compressed`];
  const algorithm = row[`${prefix}CompressionAlgorithm`];

  if (!(bytes instanceof Uint8Array) || typeof algorithm !== "string") {
    return null;
  }

  return decompressText((await decryptWith(bytes, markerOf(row))).slice().buffer, algorithm);
}

async function sealBody(text: string | null, cipher: Cipher) {
  if (text === null) {
    return { bytes: null, algorithm: null };
  }

  const compressed = await compressText(text);

  return {
    bytes: await cipher.encrypt(new Uint8Array(compressed.buffer)),
    algorithm: compressed.algorithm,
  };
}

/** A missing body on one side is an empty one: somebody wrote into a note that had none. */
async function mergeBody(
  prefix: "linear" | "scene",
  rows: { base: StoredRecord | null; local: StoredRecord; remote: StoredRecord },
  prefer: Side,
): Promise<string | null> {
  const local = await openBody(rows.local, prefix);
  const remote = await openBody(rows.remote, prefix);
  const base = rows.base ? await openBody(rows.base, prefix) : null;

  if (local === null || remote === null) {
    return local ?? remote;
  }

  return prefix === "linear"
    ? mergeHtml(base ?? "", local, remote, prefer)
    : mergeScenes(base, local, remote, prefer);
}

const sceneFilesSchema = z.array(z.looseObject({ id: z.string() }));

function sceneFilesOf(row: StoredRecord): z.infer<typeof sceneFilesSchema> {
  const parsed = sceneFilesSchema.safeParse(row.sceneFiles);

  return parsed.success ? parsed.data : [];
}

async function mergeDocument(
  rows: { base: StoredRecord | null; local: StoredRecord; remote: StoredRecord },
  prefer: Side,
  cipher: Cipher,
): Promise<StoredRecord> {
  const linear = await sealBody(await mergeBody("linear", rows, prefer), cipher);
  const scene = await sealBody(await mergeBody("scene", rows, prefer), cipher);
  // A picture either side drew stays listed. A file no longer drawn is cleaned up by the
  // next save of the scene, which already counts references before it deletes anything.
  const files = new Map(
    [...sceneFilesOf(rows.remote), ...sceneFilesOf(rows.local)].map((file) => [file.id, file]),
  );

  return {
    ...rows.local,
    linearCompressed: linear.bytes,
    linearCompressionAlgorithm: linear.algorithm,
    sceneCompressed: scene.bytes,
    sceneCompressionAlgorithm: scene.algorithm,
    sceneFiles: [...files.values()],
    encryption: cipher.name,
    keyId: cipher.keyId || undefined,
  };
}

async function openFields(row: StoredRecord, field: string | null): Promise<StoredRecord> {
  const value = field === null ? undefined : row[field];
  const opened =
    field !== null && typeof value === "string"
      ? { ...row, [field]: await openText(value, markerOf(row)) }
      : row;

  return Object.fromEntries(Object.entries(opened).filter(([key]) => !BOOKKEEPING.has(key)));
}

async function mergeRecord(
  store: Exclude<SyncStore, "notes-documents">,
  rows: { base: StoredRecord | null; local: StoredRecord; remote: StoredRecord },
  prefer: Side,
  cipher: Cipher,
): Promise<StoredRecord> {
  const field = DISPLAY_FIELDS[store];
  const merged = mergeFields(
    rows.base ? await openFields(rows.base, field) : null,
    await openFields(rows.local, field),
    await openFields(rows.remote, field),
    prefer,
  );
  const value = field === null ? undefined : merged[field];

  return {
    ...merged,
    ...(field !== null && typeof value === "string"
      ? { [field]: await sealText(value, cipher) }
      : {}),
    encryption: cipher.name === "none" ? undefined : cipher.name,
    keyId: cipher.keyId || undefined,
  };
}

/**
 * Both edits of one row, as a row to store — or null when they cannot be merged here, in
 * which case the caller keeps the ordinary last-write-wins answer.
 *
 * The result carries no `updatedAt`: the caller stamps it, because a merge is a new edit
 * and has to be newer than both of the versions it came from.
 */
export async function mergeStoredRows(
  store: SyncStore,
  rows: { base: StoredRecord | null; local: StoredRecord; remote: StoredRecord },
  prefer: Side,
): Promise<StoredRecord | null> {
  const cipher = cipherFor(rows.local, rows.remote);

  if (!cipher) {
    return null;
  }

  try {
    return store === "notes-documents"
      ? await mergeDocument(rows, prefer, cipher)
      : await mergeRecord(store, rows, prefer, cipher);
  } catch {
    return null;
  }
}
