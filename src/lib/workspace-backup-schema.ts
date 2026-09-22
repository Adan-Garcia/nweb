import { z } from "zod";

import { calendarEventSchema } from "./calendar-event";
import { cipherNameSchema } from "./cipher";
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
 *
 * Still 2 now that a backup is always written in the clear and sealed as a whole file
 * instead: nothing about the shape changed. The reader accepts an `encryption` marker on a
 * row because a build between the lock shipping and this one could write one, and reading
 * that file as though it were plaintext would restore ciphertext as the note.
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
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
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
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
});

const mediaSchema = z.object({
  id: z.string(),
  data: base64,
  mimeType: z.string(),
  created: z.number(),
  updatedAt: z.number(),
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
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
