import type { SceneFiles } from "@/components/notes/types";
import type { PersistedSceneFile } from "@/lib/notes/notes-model";
import { notesTrace, notesTraceError } from "@/lib/notes/notes-trace";

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Accepts any elements; only their optional `fileId` is read. */
export function collectReferencedFileIds(elements: readonly object[]): Set<string> {
  const fileIds = new Set<string>();

  for (const element of elements) {
    if ("fileId" in element && typeof element.fileId === "string" && element.fileId.length > 0) {
      fileIds.add(element.fileId);
    }
  }

  return fileIds;
}

export async function convertSceneFilesForStorage({
  files,
  referencedFileIds,
  optimizeImageBlob,
}: {
  files: SceneFiles;
  referencedFileIds: Set<string>;
  optimizeImageBlob: (blob: Blob) => Promise<Blob>;
}): Promise<PersistedSceneFile[]> {
  const persistedFiles: PersistedSceneFile[] = [];

  notesTrace("scene-utils", "convertSceneFilesForStorage:start", {
    totalFilesInScene: Object.keys(files).length,
    referencedFileCount: referencedFileIds.size,
  });

  for (const [fileId, file] of Object.entries(files)) {
    if (!referencedFileIds.has(fileId)) {
      continue;
    }

    let sourceBlob: Blob;

    try {
      sourceBlob = await (await fetch(file.dataURL)).blob();
    } catch (error) {
      notesTraceError("scene-utils", "sourceBlob:fetch-failed", error, {
        fileId,
        mimeType: file.mimeType,
        dataUrlPrefix: file.dataURL.slice(0, 32),
      });
      continue;
    }

    let blobToPersist = sourceBlob;

    if (sourceBlob.type.startsWith("image/")) {
      try {
        blobToPersist = await optimizeImageBlob(sourceBlob);
      } catch (error) {
        notesTraceError("scene-utils", "optimizeImageBlob:failed-using-source", error, {
          fileId,
          sourceMimeType: sourceBlob.type,
          sourceSize: sourceBlob.size,
        });
        blobToPersist = sourceBlob;
      }
    }

    notesTrace("scene-utils", "file-ready-for-persist", {
      fileId,
      sourceMimeType: sourceBlob.type,
      sourceSize: sourceBlob.size,
      persistedMimeType: blobToPersist.type || file.mimeType,
      persistedSize: blobToPersist.size,
      convertedToWebp: sourceBlob.type !== "image/webp" && blobToPersist.type === "image/webp",
    });

    persistedFiles.push({
      id: fileId,
      blob: blobToPersist,
      mimeType: blobToPersist.type || file.mimeType,
      created: file.created,
    });
  }

  notesTrace("scene-utils", "convertSceneFilesForStorage:complete", {
    persistedFileCount: persistedFiles.length,
    referencedFileCount: referencedFileIds.size,
    missingReferencedFiles: Math.max(0, referencedFileIds.size - persistedFiles.length),
  });

  return persistedFiles;
}
