import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { notesTrace } from "@/lib/notes-trace";

const NOTES_DB_NAME = "cuervo-notes";
const NOTES_DB_VERSION = 2;

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
};

type SceneFileRef = {
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

type NotesDocumentRecord = {
  id: string;
  linearCompressed: Uint8Array | null;
  linearCompressionAlgorithm: string | null;
  sceneCompressed: Uint8Array | null;
  sceneCompressionAlgorithm: string | null;
  sceneFiles: SceneFileRef[];
  updatedAt: number;
};

type NotesMediaRecord = {
  id: string;
  blob: Blob;
  mimeType: string;
  created: number;
  updatedAt: number;
};

interface NotesDbSchema extends DBSchema {
  "notes-documents": {
    key: string;
    value: NotesDocumentRecord;
  };
  "notes-media": {
    key: string;
    value: NotesMediaRecord;
  };
  "notes-directory": {
    key: string;
    value: NotesDirectoryEntry;
  };
}

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

let dbPromise: Promise<IDBPDatabase<NotesDbSchema>> | null = null;

function buildEmptyDocument(id: string): NotesDocumentRecord {
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

function getNotesDb() {
  if (!dbPromise) {
    dbPromise = openDB<NotesDbSchema>(NOTES_DB_NAME, NOTES_DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("notes-documents")) {
          database.createObjectStore("notes-documents", {
            keyPath: "id",
          });
        }

        if (!database.objectStoreNames.contains("notes-media")) {
          database.createObjectStore("notes-media", {
            keyPath: "id",
          });
        }

        if (!database.objectStoreNames.contains("notes-directory")) {
          database.createObjectStore("notes-directory", {
            keyPath: "id",
          });
        }
      },
    });
  }

  return dbPromise;
}

export function revokeObjectUrls(urls: readonly string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read blob as data URL"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read blob as data URL"));
    };

    reader.readAsDataURL(blob);
  });
}

export async function listNotesDirectoryEntries(): Promise<
  NotesDirectoryEntry[]
> {
  const database = await getNotesDb();
  const rawEntries = await database.getAll("notes-directory");
  const entries = rawEntries.map((entry) => ({
    ...entry,
    createdMode: entry.createdMode ?? "linear",
  }));

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertNotesDirectoryEntry({
  id,
  location,
  createdMode,
}: {
  id: string;
  location: NotesHierarchyLocation;
  createdMode?: NotesDocumentMode;
}): Promise<NotesDirectoryEntry> {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", id);

  const nextRecord: NotesDirectoryEntry = {
    id,
    wing: location.wing,
    flight: location.flight,
    branch: location.branch,
    nest: location.nest,
    feather: location.feather,
    createdMode: existing?.createdMode ?? createdMode ?? "linear",
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  await database.put("notes-directory", nextRecord);
  return nextRecord;
}

export async function touchNotesDirectoryEntry(
  documentId: string,
  fallbackCreatedMode?: NotesDocumentMode,
) {
  const database = await getNotesDb();
  const existing = await database.get("notes-directory", documentId);

  if (!existing) {
    return;
  }

  await database.put("notes-directory", {
    ...existing,
    createdMode: existing.createdMode ?? fallbackCreatedMode ?? "linear",
    updatedAt: Date.now(),
  });
}

export async function loadNotesDocument(
  documentId = DEFAULT_NOTES_DOCUMENT_ID,
): Promise<LoadedNotesDocument | null> {
  const database = await getNotesDb();
  const documentRecord = await database.get("notes-documents", documentId);

  notesTrace("notes-storage", "loadNotesDocument:start", {
    documentId,
    hasDocument: Boolean(documentRecord),
  });

  if (!documentRecord) {
    return null;
  }

  const sceneFiles: Record<string, LoadedSceneFile> = {};
  const objectUrls: string[] = [];
  const missingMediaIds: string[] = [];

  for (const fileRef of documentRecord.sceneFiles) {
    const mediaRecord = await database.get("notes-media", fileRef.id);

    if (!mediaRecord) {
      missingMediaIds.push(fileRef.id);
      continue;
    }

    const dataUrl = await blobToDataUrl(mediaRecord.blob);

    sceneFiles[fileRef.id] = {
      id: fileRef.id,
      mimeType: mediaRecord.mimeType,
      created: mediaRecord.created,
      dataUrl,
    };
  }

  notesTrace("notes-storage", "loadNotesDocument:complete", {
    documentId,
    declaredSceneFileRefs: documentRecord.sceneFiles.length,
    loadedSceneFiles: Object.keys(sceneFiles).length,
    missingSceneFiles: missingMediaIds,
  });

  return {
    document: documentRecord,
    sceneFiles,
    objectUrls,
  };
}

export async function saveLinearDocumentPayload({
  documentId = DEFAULT_NOTES_DOCUMENT_ID,
  compressionAlgorithm,
  compressed,
  createdMode,
}: {
  documentId?: string;
  compressionAlgorithm: string;
  compressed: Uint8Array;
  createdMode?: NotesDocumentMode;
}) {
  const database = await getNotesDb();
  const existingDocument =
    (await database.get("notes-documents", documentId)) ??
    buildEmptyDocument(documentId);

  await database.put("notes-documents", {
    ...existingDocument,
    linearCompressed: compressed,
    linearCompressionAlgorithm: compressionAlgorithm,
    updatedAt: Date.now(),
  });

  await touchNotesDirectoryEntry(documentId, createdMode);
}

export async function saveSpatialDocumentPayload({
  documentId = DEFAULT_NOTES_DOCUMENT_ID,
  compressionAlgorithm,
  compressed,
  files,
  referencedFileIds,
  createdMode,
}: {
  documentId?: string;
  compressionAlgorithm: string;
  compressed: Uint8Array;
  files: PersistedSceneFile[];
  referencedFileIds?: readonly string[];
  createdMode?: NotesDocumentMode;
}) {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["notes-documents", "notes-media"],
    "readwrite",
  );

  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");

  const existingDocument =
    (await documentStore.get(documentId)) ?? buildEmptyDocument(documentId);

  notesTrace("notes-storage", "saveSpatialDocumentPayload:start", {
    documentId,
    incomingFileCount: files.length,
    previousSceneFileCount: existingDocument.sceneFiles.length,
    incomingMimeTypes: files.map((file) => file.mimeType),
  });

  const nextSceneFiles: SceneFileRef[] = [];

  for (const file of files) {
    await mediaStore.put({
      id: file.id,
      blob: file.blob,
      mimeType: file.mimeType,
      created: file.created,
      updatedAt: Date.now(),
    });

    nextSceneFiles.push({
      id: file.id,
      mimeType: file.mimeType,
      created: file.created,
    });
  }

  if (referencedFileIds?.length) {
    const retainedFileIds = new Set(nextSceneFiles.map((file) => file.id));

    for (const existingFile of existingDocument.sceneFiles) {
      if (
        referencedFileIds.includes(existingFile.id) &&
        !retainedFileIds.has(existingFile.id)
      ) {
        nextSceneFiles.push(existingFile);
        retainedFileIds.add(existingFile.id);
      }
    }
  }

  const nextSceneFileIds = new Set(nextSceneFiles.map((file) => file.id));
  const previousSceneFileIds = new Set(
    existingDocument.sceneFiles.map((file) => file.id),
  );
  const deletedFileIds: string[] = [];

  for (const previousId of previousSceneFileIds) {
    if (!nextSceneFileIds.has(previousId)) {
      await mediaStore.delete(previousId);
      deletedFileIds.push(previousId);
    }
  }

  await documentStore.put({
    ...existingDocument,
    sceneCompressed: compressed,
    sceneCompressionAlgorithm: compressionAlgorithm,
    sceneFiles: nextSceneFiles,
    updatedAt: Date.now(),
  });

  await transaction.done;

  notesTrace("notes-storage", "saveSpatialDocumentPayload:complete", {
    documentId,
    persistedFileCount: nextSceneFiles.length,
    deletedFileCount: deletedFileIds.length,
    deletedFileIds,
  });

  await touchNotesDirectoryEntry(documentId, createdMode);
}
