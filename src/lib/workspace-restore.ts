import { base64ToBytes } from "./base64";
import { type Cipher, decryptWith, getActiveCipher } from "./cipher";
import type { Branch, Flight, Nest, Wing } from "./entity-model";
import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentRecord, NotesMediaRecord } from "./notes-model";
import type { Pebble } from "./pebble-model";
import { openRows, type SealedRow, sealRows } from "./sealed-text";
import type { Twig } from "./twig-model";
import { isLegacyBackupEntry, type WorkspaceBackup } from "./workspace-backup-schema";
import { convertLegacyWorkspace, type LegacyDirectoryEntry } from "./workspace-migrate";

/**
 * Applying a backup, as opposed to writing one.
 *
 * It sits apart from `workspace-backup.ts` because it is the half that touches the
 * database: it converts an older file into today's shape, seals what it holds with
 * whatever cipher is active, and replaces every store in one transaction.
 */
export type RestoreSummary = {
  notes: number;
  media: number;
  events: number;
};

/**
 * `replace` clears every store first, so the result is exactly what was exported.
 * `merge` keeps what is here and takes from the file only what is newer.
 */
export type RestoreMode = "replace" | "merge";

type ResolvedBackup = {
  wings: Wing[];
  flights: Flight[];
  branches: Branch[];
  nests: Nest[];
  directory: NotesDirectoryEntry[];
  twigs: Twig[];
};

/**
 * A version 1 file has no entities and stores its paths on the notes, so it is converted
 * the same way the database upgrade converts them. A version 2 file is already in shape.
 */
function resolveBackup(backup: WorkspaceBackup): ResolvedBackup {
  const legacyEntries: LegacyDirectoryEntry[] = [];
  const currentEntries: NotesDirectoryEntry[] = [];

  for (const entry of backup.notes.directory) {
    if (isLegacyBackupEntry(entry)) {
      legacyEntries.push(entry);
    } else {
      currentEntries.push(entry);
    }
  }

  if (!legacyEntries.length && !backup.calendar.length) {
    return {
      wings: backup.workspace.wings,
      flights: backup.workspace.flights,
      branches: backup.workspace.branches,
      nests: backup.workspace.nests,
      directory: currentEntries,
      twigs: backup.twigs,
    };
  }

  const converted = convertLegacyWorkspace({
    entries: legacyEntries,
    events: backup.calendar,
  });

  return {
    wings: [...backup.workspace.wings, ...converted.wings],
    flights: [...backup.workspace.flights, ...converted.flights],
    branches: [...backup.workspace.branches, ...converted.branches],
    nests: [...backup.workspace.nests, ...converted.nests],
    directory: [...currentEntries, ...converted.directory],
    twigs: [...backup.twigs, ...converted.twigs],
  };
}

/**
 * A row out of a file, ready for this database: opened with whatever marker it carries —
 * which is nothing at all for a file this version wrote — and sealed with the cipher that
 * is active now. A marked row from an older build that this browser cannot open throws
 * here, which is the right end for a restore that would otherwise store ciphertext as a
 * title.
 */
async function reseal<Key extends string, Row extends Record<Key, string> & SealedRow>(
  rows: Row[],
  key: Key,
  cipher: Cipher,
): Promise<Row[]> {
  return sealRows(await openRows(rows, key), key, cipher);
}

/**
 * Last write wins, by `updatedAt`.
 *
 * It is the rule a sync will need, and the reason every record has carried `updatedAt` and
 * a `deletedAt` tombstone since the entity layer landed. A tombstone is a row like any
 * other here, so a note deleted after the backup was taken stays deleted, and one deleted
 * before it and rewritten since stays alive. `updatedAt` is never sealed, so deciding this
 * costs no decryption.
 */
function isNewer(incoming: { updatedAt: number }, existing: { updatedAt: number } | undefined) {
  return !existing || incoming.updatedAt > existing.updatedAt;
}

/** Writes a store's incoming rows, all of them or only the ones that win. */
async function applyRows<Row extends { id: string; updatedAt: number }>(
  store: {
    get: (key: string) => Promise<Row | undefined>;
    put: (row: Row) => Promise<unknown>;
  },
  rows: Row[],
  mode: RestoreMode,
): Promise<number> {
  let written = 0;

  for (const row of rows) {
    if (mode === "merge" && !isNewer(row, await store.get(row.id))) {
      continue;
    }

    await store.put(row);
    written += 1;
  }

  return written;
}

const RESTORE_STORES = [
  "notes-directory",
  "notes-documents",
  "notes-media",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
] as const;

/**
 * Applies a backup, either over the workspace or into it.
 *
 * `replace` is the old behaviour and the one to reach for on a new device: everything
 * stored is cleared, so the result is exactly what was exported. `merge` is for a device
 * that has been used since the file was written — it keeps what is here and takes only
 * what the file has newer, by the same last-write-wins rule a sync would use.
 *
 * A file holds plaintext, so what comes in is sealed with whatever cipher is active now —
 * restoring into a locked workspace must not leave a readable row beside the sealed ones.
 * Every seal happens before the transaction opens, because a transaction held across a
 * non-IndexedDB await commits itself.
 */
export async function restoreWorkspaceBackup(
  backup: WorkspaceBackup,
  mode: RestoreMode = "replace",
): Promise<RestoreSummary> {
  const resolved = resolveBackup(backup);
  const cipher = getActiveCipher();

  const documents: NotesDocumentRecord[] = await Promise.all(
    backup.notes.documents.map(async (record) => {
      return {
        ...record,
        linearCompressed: record.linearCompressed
          ? await cipher.encrypt(await decryptWith(base64ToBytes(record.linearCompressed), record))
          : null,
        sceneCompressed: record.sceneCompressed
          ? await cipher.encrypt(await decryptWith(base64ToBytes(record.sceneCompressed), record))
          : null,
        encryption: cipher.name,
        keyId: cipher.keyId || undefined,
      };
    }),
  );
  const media: NotesMediaRecord[] = await Promise.all(
    backup.notes.media.map(async (record) => ({
      id: record.id,
      blob: new Blob(
        [
          Uint8Array.from(
            await cipher.encrypt(await decryptWith(base64ToBytes(record.data), record)),
          ),
        ],
        { type: cipher.name === "none" ? record.mimeType : "" },
      ),
      mimeType: record.mimeType,
      created: record.created,
      updatedAt: record.updatedAt,
      encryption: cipher.name,
      keyId: cipher.keyId || undefined,
    })),
  );

  const directory = await reseal(resolved.directory, "feather", cipher);
  const wings = await reseal(resolved.wings, "name", cipher);
  const flights = await reseal(resolved.flights, "name", cipher);
  const branches = await reseal(resolved.branches, "name", cipher);
  const nests = await reseal(resolved.nests, "name", cipher);
  const twigs = await reseal(resolved.twigs, "title", cipher);
  const pebbles: Pebble[] = await reseal(backup.pebbles, "name", cipher);

  const database = await getNotesDb();
  const transaction = database.transaction(RESTORE_STORES, "readwrite");

  if (mode === "replace") {
    await Promise.all(RESTORE_STORES.map((name) => transaction.objectStore(name).clear()));
  }

  const notes = await applyRows(transaction.objectStore("notes-directory"), directory, mode);
  const mediaWritten = await applyRows(transaction.objectStore("notes-media"), media, mode);
  const events = await applyRows(transaction.objectStore("twigs"), twigs, mode);

  await applyRows(transaction.objectStore("notes-documents"), documents, mode);
  await applyRows(transaction.objectStore("wings"), wings, mode);
  await applyRows(transaction.objectStore("flights"), flights, mode);
  await applyRows(transaction.objectStore("branches"), branches, mode);
  await applyRows(transaction.objectStore("nests"), nests, mode);
  await applyRows(transaction.objectStore("pebbles"), pebbles, mode);

  await transaction.done;

  return { notes, media: mediaWritten, events };
}
