import { blobToDataUrl } from "./blob-utils";
import { decryptWith, getActiveCipher } from "./cipher";
import { getNotesDb } from "./notes-db";
import { touchNotesDirectoryEntry } from "./notes-directory-storage";
import {
  buildEmptyDocument,
  DEFAULT_NOTES_DOCUMENT_ID,
  type LoadedNotesDocument,
  type LoadedSceneFile,
  type NotesDocumentMode,
  type PersistedSceneFile,
  type SceneFileRef,
} from "./notes-model";
import { notesTrace } from "./notes-trace";

export async function loadNotesDocument(
  documentId = DEFAULT_NOTES_DOCUMENT_ID,
): Promise<LoadedNotesDocument | null> {
  const database = await getNotesDb();
  const storedRecord = await database.get("notes-documents", documentId);
  // Rows written before the cipher seam existed carry no marker, which means plaintext.
  const wroteWith = storedRecord?.encryption ?? "none";
  const documentRecord = storedRecord
    ? {
        ...storedRecord,
        linearCompressed: storedRecord.linearCompressed
          ? await decryptWith(storedRecord.linearCompressed, wroteWith)
          : null,
        sceneCompressed: storedRecord.sceneCompressed
          ? await decryptWith(storedRecord.sceneCompressed, wroteWith)
          : null,
      }
    : undefined;

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
    (await database.get("notes-documents", documentId)) ?? buildEmptyDocument(documentId);

  const cipher = getActiveCipher();
  const sealed = await cipher.encrypt(compressed);

  await database.put("notes-documents", {
    ...existingDocument,
    linearCompressed: sealed,
    linearCompressionAlgorithm: compressionAlgorithm,
    updatedAt: Date.now(),
    encryption: cipher.name,
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
  // Sealed before the transaction opens, not inside it: awaiting anything that is not an
  // IndexedDB request lets the transaction auto-commit, and the puts below would then fail
  // with TransactionInactiveError in a real browser.
  const cipher = getActiveCipher();
  const sealed = await cipher.encrypt(compressed);
  const transaction = database.transaction(["notes-documents", "notes-media"], "readwrite");

  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");

  const existingDocument = (await documentStore.get(documentId)) ?? buildEmptyDocument(documentId);

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
      if (referencedFileIds.includes(existingFile.id) && !retainedFileIds.has(existingFile.id)) {
        nextSceneFiles.push(existingFile);
        retainedFileIds.add(existingFile.id);
      }
    }
  }

  const nextSceneFileIds = new Set(nextSceneFiles.map((file) => file.id));
  const previousSceneFileIds = new Set(existingDocument.sceneFiles.map((file) => file.id));
  const deletedFileIds: string[] = [];

  for (const previousId of previousSceneFileIds) {
    if (!nextSceneFileIds.has(previousId)) {
      await mediaStore.delete(previousId);
      deletedFileIds.push(previousId);
    }
  }

  await documentStore.put({
    ...existingDocument,
    sceneCompressed: sealed,
    sceneCompressionAlgorithm: compressionAlgorithm,
    sceneFiles: nextSceneFiles,
    updatedAt: Date.now(),
    encryption: cipher.name,
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
