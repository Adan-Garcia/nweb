import { type Schedule, type SyncRow, type SyncStore } from "@shared/sync-contract";
import { z } from "zod";

import { base64ToBytes, bytesToBase64 } from "../crypto/base64";
import { type Cipher, decryptWith } from "../crypto/cipher";
import { branchSchema, flightSchema, nestSchema, wingSchema } from "../hierarchy/entity-model";
import { pebbleSchema } from "../hierarchy/pebble-model";
import { sharePathRecordSchema } from "../hierarchy/share-path-model";
import { cipherForObject } from "../keys/object-keys";
import { preferencesSchema } from "../preferences/preferences-model";
import { twigSchema } from "../twigs/twig-model";

/**
 * A stored row on one side, and something a server can hold on the other.
 *
 * The whole row is sealed into `payload`. The alternative — sending the row as it is
 * stored, with only its name sealed — would hand the server the shape of the workspace for
 * nothing: which course a note is in, how a task is tagged, what kind it is. None of that
 * is anything the server has a use for, so none of it leaves.
 *
 * What travels outside the seal is what the server has a job to do with: an id to key on,
 * timestamps to resolve a conflict with, and, for a task, the date and status a reminder
 * needs. That list is the same one `sealed-text.ts` keeps in the clear locally, and it is
 * not to be extended without the same argument being made again.
 */
const documentPayloadSchema = z.object({
  id: z.string(),
  linearCompressed: z.string().nullable(),
  linearCompressionAlgorithm: z.string().nullable(),
  sceneCompressed: z.string().nullable(),
  sceneCompressionAlgorithm: z.string().nullable(),
  sceneFiles: z.array(z.object({ id: z.string(), mimeType: z.string(), created: z.number() })),
  updatedAt: z.number(),
  encryption: z.enum(["none", "aes-gcm"]).optional(),
  keyId: z.string().optional(),
});

const directoryPayloadSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  nestIds: z.array(z.string()).default([]),
  feather: z.string(),
  createdMode: z.enum(["linear", "spatial"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable().default(null),
  encryption: z.enum(["none", "aes-gcm"]).optional(),
  keyId: z.string().optional(),
});

/** What a row of each store must look like once it is opened. Nothing is taken on trust. */
const PAYLOAD_SCHEMAS = {
  "notes-directory": directoryPayloadSchema,
  "notes-documents": documentPayloadSchema,
  wings: wingSchema,
  flights: flightSchema,
  branches: branchSchema,
  nests: nestSchema,
  twigs: twigSchema,
  pebbles: pebbleSchema,
  "share-paths": sharePathRecordSchema,
  preferences: preferencesSchema,
} as const;

/**
 * A row with the fields every store shares. The index signature is what lets a whole twig
 * or wing be passed without each one needing its own overload — what is done with the rest
 * of it is decided by the schema for its store, not by this type.
 */
export type StoredRow = {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
  /** Which key sealed this row locally, and therefore which one it travels under. */
  keyId?: string;
  [field: string]: unknown;
};

/** A task's schedule, read off the row. Every other store has none. */
function scheduleFor(store: SyncStore, row: StoredRow): Schedule {
  if (store !== "twigs") {
    return null;
  }

  const twig = twigSchema.safeParse(row);

  return twig.success
    ? {
        dueDate: twig.data.dueDate,
        dueMinutes: twig.data.dueMinutes,
        timeZone: twig.data.timeZone,
        status: twig.data.status,
      }
    : null;
}

/**
 * Documents hold compressed bytes, which JSON turns into an object of numbered keys. They
 * are base64'd on the way out and back on the way in, the same way a backup carries them.
 */
function encodeRow(store: SyncStore, row: StoredRow): unknown {
  if (store !== "notes-documents") {
    return row;
  }

  const document = row as unknown as {
    linearCompressed: Uint8Array | null;
    sceneCompressed: Uint8Array | null;
  };

  return {
    ...row,
    linearCompressed: document.linearCompressed ? bytesToBase64(document.linearCompressed) : null,
    sceneCompressed: document.sceneCompressed ? bytesToBase64(document.sceneCompressed) : null,
  };
}

function decodeRow(store: SyncStore, row: Record<string, unknown>): Record<string, unknown> {
  if (store !== "notes-documents") {
    return row;
  }

  return {
    ...row,
    linearCompressed:
      typeof row.linearCompressed === "string" ? base64ToBytes(row.linearCompressed) : null,
    sceneCompressed:
      typeof row.sceneCompressed === "string" ? base64ToBytes(row.sceneCompressed) : null,
  };
}

/**
 * A row, sealed for the wire under **its own** key rather than the workspace's.
 *
 * That is what makes the `keyId` the server files it under the object's, which is what the
 * row store scopes delivery by. Sealing everything with the active cipher would stamp every
 * row with the wing's key: a recipient granted one course would be served nothing, because
 * nothing they can derive would match.
 */
export async function toSyncRow(
  store: SyncStore,
  row: StoredRow,
  cipher: Cipher = cipherForObject(row.keyId),
): Promise<SyncRow> {
  const json = new TextEncoder().encode(JSON.stringify(encodeRow(store, row)));

  return {
    store,
    id: row.id,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    keyId: cipher.keyId,
    encryption: cipher.name,
    payload: bytesToBase64(await cipher.encrypt(json)),
    schedule: scheduleFor(store, row),
  };
}

/**
 * Opens a row that came back from the server, and refuses one that does not parse.
 *
 * Null rather than a throw: one unreadable row in a page of two hundred should not stop
 * the other hundred and ninety-nine being applied. What it must never do is write the row
 * anyway — a row this build cannot make sense of is one a later build might, and storing
 * a half-understood version of it would lose whatever it did not understand.
 */
export async function fromSyncRow(
  row: SyncRow,
  cipher?: Cipher,
): Promise<Record<string, unknown> | null> {
  try {
    const opened = await decryptWith(base64ToBytes(row.payload), row, cipher);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(opened));

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    // Validated in the shape it travelled in — base64 for a document's bytes — and only
    // decoded once it is known to be a row of that store. Decoding first would hand the
    // schema a `Uint8Array` where it declares a string, and it would reject its own work.
    const result = PAYLOAD_SCHEMAS[row.store].safeParse(parsed);

    return result.success ? decodeRow(row.store, result.data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
