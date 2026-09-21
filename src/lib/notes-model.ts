export const DEFAULT_NOTES_DOCUMENT_ID = "notes-main";

export type NotesDocumentMode = "linear" | "spatial";

export type NotesHierarchyLocation = {
  wing: string;
  flight: string;
  branch: string;
  nest: string;
  feather: string;
};

export type NotesDirectoryEntry = NotesHierarchyLocation & {
  id: string;
  createdMode: NotesDocumentMode;
  createdAt: number;
  updatedAt: number;
  /**
   * Tombstone rather than a hard delete, so a future sync can tell "deleted here" from
   * "not yet created here". Entries written before this field existed read back as null.
   */
  deletedAt: number | null;
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
};

export type NotesMediaRecord = {
  id: string;
  blob: Blob;
  mimeType: string;
  created: number;
  updatedAt: number;
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
  };
}
