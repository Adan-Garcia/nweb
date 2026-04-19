import type { PersistedSceneFile } from "@/lib/notes-storage"
import type { SceneElements, SceneFiles } from "@/components/notes/types"

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
}

export function collectReferencedFileIds(elements: SceneElements): Set<string> {
  const fileIds = new Set<string>()

  for (const element of elements) {
    if ("fileId" in element && typeof element.fileId === "string" && element.fileId.length > 0) {
      fileIds.add(element.fileId)
    }
  }

  return fileIds
}

export async function convertSceneFilesForStorage({
  files,
  referencedFileIds,
  optimizeImageBlob,
}: {
  files: SceneFiles
  referencedFileIds: Set<string>
  optimizeImageBlob: (blob: Blob) => Promise<Blob>
}): Promise<PersistedSceneFile[]> {
  const persistedFiles: PersistedSceneFile[] = []

  for (const [fileId, file] of Object.entries(files)) {
    if (!referencedFileIds.has(fileId)) {
      continue
    }

    try {
      const sourceBlob = await (await fetch(file.dataURL)).blob()
      const optimizedBlob = sourceBlob.type.startsWith("image/")
        ? await optimizeImageBlob(sourceBlob)
        : sourceBlob

      persistedFiles.push({
        id: fileId,
        blob: optimizedBlob,
        mimeType: optimizedBlob.type || file.mimeType,
        created: file.created,
      })
    } catch {
      continue
    }
  }

  return persistedFiles
}