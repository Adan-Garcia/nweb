import { z } from "zod";

import { calendarEventSchema } from "./calendar-event";
import { branchSchema, flightSchema, nestSchema, wingSchema } from "./entity-model";
import { pebbleSchema } from "./pebble-model";
import { twigSchema } from "./twig-model";
import { legacyDirectoryEntrySchema } from "./workspace-migrate";

/**
 * Bumped whenever the backup file's shape changes; the reader must keep accepting older
 * values.
 *
 * 2 carries the entity layer: wings, flights, branches, nests, twigs and pebbles, with
 * notes pointing at a branch instead of repeating their path. A version 1 file still
 * restores — its string paths are converted on the way in, the same way the database
 * upgrade converts them.
 */
export const WORKSPACE_BACKUP_VERSION = 2;

export const WORKSPACE_BACKUP_FORMAT = "cuervo-planner-backup";

const base64 = z.string();

const directoryEntrySchema = z.object({
  id: z.string(),
  branchId: z.string(),
  nestIds: z.array(z.string()).default([]),
  feather: z.string(),
  createdMode: z.enum(["linear", "spatial"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable().default(null),
});

const sceneFileRefSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  created: z.number(),
});

const documentSchema = z.object({
  id: z.string(),
  linearCompressed: base64.nullable(),
  linearCompressionAlgorithm: z.string().nullable(),
  sceneCompressed: base64.nullable(),
  sceneCompressionAlgorithm: z.string().nullable(),
  sceneFiles: z.array(sceneFileRefSchema),
  updatedAt: z.number(),
});

const mediaSchema = z.object({
  id: z.string(),
  data: base64,
  mimeType: z.string(),
  created: z.number(),
  updatedAt: z.number(),
});

const workspaceSchema = z
  .object({
    wings: z.array(wingSchema).default([]),
    flights: z.array(flightSchema).default([]),
    branches: z.array(branchSchema).default([]),
    nests: z.array(nestSchema).default([]),
  })
  .default({ wings: [], flights: [], branches: [], nests: [] });

export const workspaceBackupSchema = z.object({
  format: z.literal(WORKSPACE_BACKUP_FORMAT),
  version: z.number().int().positive().max(WORKSPACE_BACKUP_VERSION),
  exportedAt: z.string(),
  notes: z.object({
    /**
     * A version 1 file holds the five-string rows, a version 2 file the branch-pointing
     * ones. Both are accepted here and told apart when the backup is applied.
     */
    directory: z.array(z.union([directoryEntrySchema, legacyDirectoryEntrySchema])),
    documents: z.array(documentSchema),
    media: z.array(mediaSchema),
  }),
  workspace: workspaceSchema,
  twigs: z.array(twigSchema).default([]),
  pebbles: z.array(pebbleSchema).default([]),
  /** Only ever present in a version 1 file; converted into twigs on restore. */
  calendar: z.array(calendarEventSchema).default([]),
});

export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>;
export type BackupDirectoryEntry = WorkspaceBackup["notes"]["directory"][number];

/** A version 1 row still carries its path, which is what tells the two shapes apart. */
export function isLegacyBackupEntry(
  entry: BackupDirectoryEntry,
): entry is z.infer<typeof legacyDirectoryEntrySchema> {
  return "wing" in entry;
}

/**
 * Chunked so a large note does not blow the argument limit of `String.fromCharCode`,
 * which a spread over a multi-megabyte scene would.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }

  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
