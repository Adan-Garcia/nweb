import type { CipherName } from "./cipher";

export const DEFAULT_NOTES_DOCUMENT_ID = "notes-main";

export type NotesDocumentMode = "linear" | "spatial";

export type NotesHierarchyLocation = {
  wing: string;
  flight: string;
  branch: string;
  nest: string;
  feather: string;
};

/**
 * A note. Since version 4 it points at a branch rather than repeating its path, so
 * renaming a wing, flight or branch renames it everywhere at once, and carries its nests
 * as tags because one note can belong to several units.
 */
export type NotesDirectoryEntry = {
  id: string;
  branchId: string;
  nestIds: string[];
  /** The note's own title. The only path segment that still lives on the note. */
  feather: string;
  createdMode: NotesDocumentMode;
  createdAt: number;
  updatedAt: number;
  /**
   * Tombstone rather than a hard delete, so a future sync can tell "deleted here" from
   * "not yet created here". Entries written before this field existed read back as null.
   */
  deletedAt: number | null;
  /**
   * Which cipher wrote `feather`. Absent means plaintext, as it does on every other named
   * row. The timestamps beside it are never sealed — see `sealed-text.ts`.
   */
  encryption?: CipherName;
};

export type SceneFileRef = {
  id: string;
  mimeType: string;
  created: number;
};

export type PersistedSceneFile = {
  id: string;
  blob: Blob;
  mimeType: string;
  created: number;
};

export type NotesDocumentRecord = {
  id: string;
  linearCompressed: Uint8Array | null;
  linearCompressionAlgorithm: string | null;
  sceneCompressed: Uint8Array | null;
  sceneCompressionAlgorithm: string | null;
  sceneFiles: SceneFileRef[];
  updatedAt: number;
  /**
   * Which cipher wrote the compressed payloads above. Rows written before this existed
   * read back `undefined`, which `loadNotesDocument` normalizes to "none". A database can
   * hold a mix, so turning encryption on never has to rewrite everything at once.
   */
  encryption?: CipherName;
};

export type NotesMediaRecord = {
  id: string;
  blob: Blob;
  mimeType: string;
  created: number;
  updatedAt: number;
  /**
   * Which cipher wrote `blob`. When it is not "none" the blob holds ciphertext and
   * `mimeType` is what it will be once opened, not what the blob itself contains.
   */
  encryption?: CipherName;
};

export type LoadedSceneFile = {
  id: string;
  mimeType: string;
  created: number;
  dataUrl: string;
};

export type LoadedNotesDocument = {
  document: NotesDocumentRecord;
  sceneFiles: Record<string, LoadedSceneFile>;
  objectUrls: string[];
};

export function buildEmptyDocument(id: string): NotesDocumentRecord {
  return {
    id,
    linearCompressed: null,
    linearCompressionAlgorithm: null,
    sceneCompressed: null,
    sceneCompressionAlgorithm: null,
    sceneFiles: [],
    updatedAt: Date.now(),
    encryption: "none",
  };
}
