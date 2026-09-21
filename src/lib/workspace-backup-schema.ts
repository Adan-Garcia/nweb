import { z } from "zod";

import { calendarEventSchema } from "./calendar-event";

/** Bumped whenever the backup file's shape changes; the reader must keep accepting older values. */
export const WORKSPACE_BACKUP_VERSION = 1;

export const WORKSPACE_BACKUP_FORMAT = "cuervo-planner-backup";

const base64 = z.string();

const directoryEntrySchema = z.object({
  id: z.string(),
  wing: z.string(),
  flight: z.string(),
  branch: z.string(),
  nest: z.string(),
  feather: z.string(),
  createdMode: z.enum(["linear", "spatial"]),
  createdAt: z.number(),
  updatedAt: z.number(),
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

export const workspaceBackupSchema = z.object({
  format: z.literal(WORKSPACE_BACKUP_FORMAT),
  version: z.number().int().positive().max(WORKSPACE_BACKUP_VERSION),
  exportedAt: z.string(),
  notes: z.object({
    directory: z.array(directoryEntrySchema),
    documents: z.array(documentSchema),
    media: z.array(mediaSchema),
  }),
  calendar: z.array(calendarEventSchema),
});

export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>;

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
