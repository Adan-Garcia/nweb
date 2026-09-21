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
 * Replaces the workspace with the backup's contents. Everything currently stored is
 * cleared first, so the result is exactly what was exported rather than a merge.
 *
 * A file holds plaintext, so what comes in is sealed with whatever cipher is active now —
 * restoring into a locked workspace must not leave a readable row beside the sealed ones.
 * Every seal happens before the transaction opens, because a transaction held across a
 * non-IndexedDB await commits itself.
 */
export async function restoreWorkspaceBackup(backup: WorkspaceBackup): Promise<RestoreSummary> {
  const resolved = resolveBackup(backup);
  const cipher = getActiveCipher();

  const documents: NotesDocumentRecord[] = await Promise.all(
    backup.notes.documents.map(async (record) => {
      const wroteWith = record.encryption ?? "none";

      return {
        ...record,
        linearCompressed: record.linearCompressed
          ? await cipher.encrypt(
              await decryptWith(base64ToBytes(record.linearCompressed), wroteWith),
            )
          : null,
        sceneCompressed: record.sceneCompressed
          ? await cipher.encrypt(
              await decryptWith(base64ToBytes(record.sceneCompressed), wroteWith),
            )
          : null,
        encryption: cipher.name,
      };
    }),
  );
  const media: NotesMediaRecord[] = await Promise.all(
    backup.notes.media.map(async (record) => ({
      id: record.id,
      blob: new Blob(
        [
          Uint8Array.from(
            await cipher.encrypt(
              await decryptWith(base64ToBytes(record.data), record.encryption ?? "none"),
            ),
          ),
        ],
        { type: cipher.name === "none" ? record.mimeType : "" },
      ),
      mimeType: record.mimeType,
      created: record.created,
      updatedAt: record.updatedAt,
      encryption: cipher.name,
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

  await Promise.all(RESTORE_STORES.map((name) => transaction.objectStore(name).clear()));

  await Promise.all([
    ...directory.map((entry) => transaction.objectStore("notes-directory").put(entry)),
    ...documents.map((entry) => transaction.objectStore("notes-documents").put(entry)),
    ...media.map((entry) => transaction.objectStore("notes-media").put(entry)),
    ...wings.map((entry) => transaction.objectStore("wings").put(entry)),
    ...flights.map((entry) => transaction.objectStore("flights").put(entry)),
    ...branches.map((entry) => transaction.objectStore("branches").put(entry)),
    ...nests.map((entry) => transaction.objectStore("nests").put(entry)),
    ...twigs.map((entry) => transaction.objectStore("twigs").put(entry)),
    ...pebbles.map((entry) => transaction.objectStore("pebbles").put(entry)),
  ]);

  await transaction.done;

  return {
    notes: directory.length,
    media: media.length,
    events: twigs.length,
  };
}
