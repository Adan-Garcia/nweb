import { bytesToBase64 } from "./base64";
import { type CipherName, decryptWith } from "./cipher";
import {
  type EncryptedEnvelope,
  isEncryptedEnvelope,
  openWithPassphrase,
  sealWithPassphrase,
} from "./crypto-envelope";
import { getNotesDb } from "./notes-db";
import { openRows } from "./sealed-text";
import {
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_VERSION,
  type WorkspaceBackup,
  workspaceBackupSchema,
} from "./workspace-backup-schema";
function encodeOptional(bytes: Uint8Array | null): string | null {
  return bytes ? bytesToBase64(bytes) : null;
}

async function openOptional(bytes: Uint8Array | null, wroteWith: CipherName | undefined) {
  return bytes ? await decryptWith(bytes, wroteWith ?? "none") : null;
}

/**
 * Reads every store into one plain object that can be written to a file and read back.
 *
 * Everything is written out in the clear, then the file as a whole is sealed if the user
 * gave it a passphrase. That is deliberate: the workspace lock is a key held in this
 * browser and nowhere else, so a file carrying rows encrypted under it could only ever be
 * restored here. Copying the ciphertext across would produce a workspace of unreadable
 * titles with nothing able to derive the key — the export is the one moment the two
 * concerns have to be separated.
 *
 * It follows that the workspace must be unlocked to export, which it is: the settings page
 * sits behind the lock screen.
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
      data: bytesToBase64(
        await decryptWith(
          new Uint8Array(await record.blob.arrayBuffer()),
          record.encryption ?? "none",
        ),
      ),
      mimeType: record.mimeType,
      created: record.created,
      updatedAt: record.updatedAt,
    })),
  );

  const openedDocuments = await Promise.all(
    documents.map(async (record) => ({
      ...record,
      linearCompressed: encodeOptional(
        await openOptional(record.linearCompressed, record.encryption),
      ),
      sceneCompressed: encodeOptional(
        await openOptional(record.sceneCompressed, record.encryption),
      ),
      encryption: undefined,
    })),
  );

  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: {
      directory: await openRows(directory, "feather"),
      documents: openedDocuments,
      media: encodedMedia,
    },
    workspace: {
      wings: await openRows(wings, "name"),
      flights: await openRows(flights, "name"),
      branches: await openRows(branches, "name"),
      nests: await openRows(nests, "name"),
    },
    twigs: await openRows(twigs, "title"),
    pebbles: await openRows(pebbles, "name"),
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
