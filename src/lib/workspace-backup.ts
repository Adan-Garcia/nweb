import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  type EncryptedEnvelope,
  isEncryptedEnvelope,
  openWithPassphrase,
  sealWithPassphrase,
} from "./crypto-envelope";
import type { Branch, Flight, Nest, Wing } from "./entity-model";
import { getNotesDb } from "./notes-db";
import type { NotesDirectoryEntry, NotesDocumentRecord, NotesMediaRecord } from "./notes-model";
import type { Pebble } from "./pebble-model";
import type { Twig } from "./twig-model";
import {
  isLegacyBackupEntry,
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_VERSION,
  type WorkspaceBackup,
  workspaceBackupSchema,
} from "./workspace-backup-schema";
import { convertLegacyWorkspace, type LegacyDirectoryEntry } from "./workspace-migrate";

function encodeOptional(bytes: Uint8Array | null): string | null {
  return bytes ? bytesToBase64(bytes) : null;
}

/**
 * Reads every store into one plain object that can be written to a file and read back.
 *
 * Deleted records are included, as tombstones. They cost a few bytes each and carry no
 * content, and leaving them out would mean a restore could not tell something that was
 * deleted from something that never existed — under any future merge-style restore, every
 * deletion made since the backup would come back.
 */
export async function createWorkspaceBackup(now = new Date()): Promise<WorkspaceBackup> {
  const database = await getNotesDb();
  const [directory, documents, media, wings, flights, branches, nests, twigs, pebbles] =
    await Promise.all([
      database.getAll("notes-directory"),
      database.getAll("notes-documents"),
      database.getAll("notes-media"),
      database.getAll("wings"),
      database.getAll("flights"),
      database.getAll("branches"),
      database.getAll("nests"),
      database.getAll("twigs"),
      database.getAll("pebbles"),
    ]);

  const encodedMedia = await Promise.all(
    media.map(async (record) => ({
      id: record.id,
      data: bytesToBase64(new Uint8Array(await record.blob.arrayBuffer())),
      mimeType: record.mimeType,
      created: record.created,
      updatedAt: record.updatedAt,
    })),
  );

  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: {
      directory,
      documents: documents.map((record) => ({
        ...record,
        linearCompressed: encodeOptional(record.linearCompressed),
        sceneCompressed: encodeOptional(record.sceneCompressed),
      })),
      media: encodedMedia,
    },
    workspace: { wings, flights, branches, nests },
    twigs,
    pebbles,
    calendar: [],
  };
}

/**
 * Wraps a backup in an encrypted envelope. The file still says what it is, so a restore
 * can ask for the passphrase instead of failing with "not a backup".
 *
 * A forgotten passphrase means the file is gone. There is no account and no server, so
 * there is nothing that could reset it, and the UI has to say so before it is used.
 */
export function encryptWorkspaceBackup(
  backup: WorkspaceBackup,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  return sealWithPassphrase(JSON.stringify(backup), passphrase);
}

export type ParsedBackupFile =
  { backup: WorkspaceBackup } | { encrypted: EncryptedEnvelope } | { error: string };

/** Parses untrusted file contents. Returns the backup, or an error the UI can show as-is. */
export function parseWorkspaceBackup(raw: string): ParsedBackupFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That file is not valid JSON." };
  }

  if (isEncryptedEnvelope(parsed)) {
    return { encrypted: parsed };
  }

  const result = workspaceBackupSchema.safeParse(parsed);

  if (!result.success) {
    return { error: "That file is not a Cuervo Planner backup, or it is from a newer version." };
  }

  return { backup: result.data };
}

/** Opens an encrypted backup. A null return is the wrong passphrase, or a tampered file. */
export async function decryptWorkspaceBackup(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<ParsedBackupFile> {
  const plaintext = await openWithPassphrase(envelope, passphrase);

  if (plaintext === null) {
    return { error: "That passphrase does not open this file." };
  }

  return parseWorkspaceBackup(plaintext);
}

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
 */
export async function restoreWorkspaceBackup(backup: WorkspaceBackup): Promise<RestoreSummary> {
  const resolved = resolveBackup(backup);
  const database = await getNotesDb();
  const transaction = database.transaction(RESTORE_STORES, "readwrite");

  await Promise.all(RESTORE_STORES.map((name) => transaction.objectStore(name).clear()));

  const documents: NotesDocumentRecord[] = backup.notes.documents.map((record) => ({
    ...record,
    linearCompressed: record.linearCompressed ? base64ToBytes(record.linearCompressed) : null,
    sceneCompressed: record.sceneCompressed ? base64ToBytes(record.sceneCompressed) : null,
  }));
  const media: NotesMediaRecord[] = backup.notes.media.map((record) => ({
    id: record.id,
    blob: new Blob([base64ToBytes(record.data)], { type: record.mimeType }),
    mimeType: record.mimeType,
    created: record.created,
    updatedAt: record.updatedAt,
  }));
  const pebbles: Pebble[] = backup.pebbles;

  await Promise.all([
    ...resolved.directory.map((entry) => transaction.objectStore("notes-directory").put(entry)),
    ...documents.map((entry) => transaction.objectStore("notes-documents").put(entry)),
    ...media.map((entry) => transaction.objectStore("notes-media").put(entry)),
    ...resolved.wings.map((entry) => transaction.objectStore("wings").put(entry)),
    ...resolved.flights.map((entry) => transaction.objectStore("flights").put(entry)),
    ...resolved.branches.map((entry) => transaction.objectStore("branches").put(entry)),
    ...resolved.nests.map((entry) => transaction.objectStore("nests").put(entry)),
    ...resolved.twigs.map((entry) => transaction.objectStore("twigs").put(entry)),
    ...pebbles.map((entry) => transaction.objectStore("pebbles").put(entry)),
  ]);

  await transaction.done;

  return {
    notes: resolved.directory.length,
    media: media.length,
    events: resolved.twigs.length,
  };
}
