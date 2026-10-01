import { useCallback, useState } from "react";

import { defaultLinearContent } from "@/components/notes/constants";
import type { NotesDocumentMode, NotesSpatialInitialData } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import type { CanvasFile } from "@/lib/canvas/canvas-files";
import { createScene, readScene } from "@/lib/canvas/scene-model";
import { revokeObjectUrls } from "@/lib/media/blob-utils";
import type { MediaWorkerClient } from "@/lib/media/media-worker-client";
import { loadNotesDocument } from "@/lib/notes/notes-document-storage";
import type { LoadedSceneFile } from "@/lib/notes/notes-model";
import { notesTrace, notesTraceError } from "@/lib/notes/notes-trace";

/** A spatial note with nothing stored yet: an empty infinite canvas. */
function emptyDrawing(): NotesSpatialInitialData {
  return { status: "ready", scene: createScene("infinite"), files: new Map() };
}

function canvasFiles(loaded: Record<string, LoadedSceneFile>): Map<string, CanvasFile> {
  return new Map(
    Object.values(loaded).map((file) => [
      file.id,
      { id: file.id, mimeType: file.mimeType, created: file.created, url: file.dataUrl },
    ]),
  );
}

type UseNotesHydrationOptions = {
  refs: NotesSessionRefs;
  mediaWorker: MediaWorkerClient;
  resetLinearContent: (content: string) => void;
  clearPendingLinearEdit: () => void;
};

/** Loads a stored document into the linear and spatial editors. */
export function useNotesHydration({
  refs,
  mediaWorker,
  resetLinearContent,
  clearPendingLinearEdit,
}: UseNotesHydrationOptions) {
  const {
    activeObjectUrlsRef,
    latestSpatialSceneVersionRef,
    latestSpatialSnapshotRef,
    linearSaveTimeoutRef,
    loadRequestRef,
    pendingSpatialSceneVersionRef,
    persistedFileIdsRef,
    spatialSaveTimeoutRef,
  } = refs;
  const [isHydratingDocument, setIsHydratingDocument] = useState(false);
  const [spatialInitialData, setSpatialInitialData] =
    useState<NotesSpatialInitialData>(emptyDrawing);
  const [isSpatialEditorReloading, setIsSpatialEditorReloading] = useState(false);
  const [spatialEditorReloadKey, setSpatialEditorReloadKey] = useState(0);

  const recycleSpatialEditor = useCallback(async () => {
    setIsSpatialEditorReloading(true);
    setSpatialInitialData(emptyDrawing());

    await new Promise<void>((resolve) => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => {
        resolve();
      });
    });

    setSpatialEditorReloadKey((currentKey) => currentKey + 1);
  }, []);

  const hydrateDocument = useCallback(
    async (documentId: string, targetMode?: NotesDocumentMode) => {
      const requestId = ++loadRequestRef.current;
      const shouldRecycleSpatialEditor = targetMode === "spatial";

      if (shouldRecycleSpatialEditor) {
        await recycleSpatialEditor();
      }

      setIsHydratingDocument(true);

      notesTrace("notes-workspace", "hydrateDocument:start", {
        documentId,
        requestId,
      });

      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current);
      }

      if (spatialSaveTimeoutRef.current) {
        window.clearTimeout(spatialSaveTimeoutRef.current);
      }

      clearPendingLinearEdit();
      latestSpatialSnapshotRef.current = null;
      pendingSpatialSceneVersionRef.current = null;
      latestSpatialSceneVersionRef.current = 0;
      persistedFileIdsRef.current = new Set();

      try {
        const loadedDocument = await loadNotesDocument(documentId);

        if (requestId !== loadRequestRef.current) {
          return;
        }

        if (
          loadedDocument?.document.linearCompressed &&
          loadedDocument.document.linearCompressionAlgorithm
        ) {
          const decompressedLinear = await mediaWorker.decompressText(
            loadedDocument.document.linearCompressed,
            loadedDocument.document.linearCompressionAlgorithm,
          );

          if (requestId === loadRequestRef.current) {
            resetLinearContent(decompressedLinear);
          }
        } else {
          resetLinearContent(defaultLinearContent);
        }

        if (
          loadedDocument?.document.sceneCompressed &&
          loadedDocument.document.sceneCompressionAlgorithm
        ) {
          const decompressedScene = await mediaWorker.decompressText(
            loadedDocument.document.sceneCompressed,
            loadedDocument.document.sceneCompressionAlgorithm,
          );

          if (requestId !== loadRequestRef.current) {
            return;
          }

          const read = readScene(decompressedScene);

          notesTrace("notes-workspace", "hydrateDocument:restored-scene", {
            documentId,
            requestId,
            readable: read.ok,
            storedSceneFileRefs: loadedDocument.document.sceneFiles.length,
            loadedSceneFiles: Object.keys(loadedDocument.sceneFiles).length,
          });

          revokeObjectUrls(activeObjectUrlsRef.current);
          activeObjectUrlsRef.current = loadedDocument.objectUrls;
          persistedFileIdsRef.current = new Set(Object.keys(loadedDocument.sceneFiles));

          setSpatialInitialData(
            read.ok
              ? {
                  status: "ready",
                  scene: read.scene,
                  files: canvasFiles(loadedDocument.sceneFiles),
                }
              : { status: "unreadable", reason: read.reason },
          );
        } else {
          revokeObjectUrls(activeObjectUrlsRef.current);
          activeObjectUrlsRef.current = [];
          setSpatialInitialData(emptyDrawing());
        }
      } catch (error) {
        notesTraceError("notes-workspace", "hydrateDocument:failed", error, {
          documentId,
          requestId,
        });
        if (requestId !== loadRequestRef.current) {
          return;
        }

        revokeObjectUrls(activeObjectUrlsRef.current);
        activeObjectUrlsRef.current = [];
        resetLinearContent(defaultLinearContent);
        // Never an empty canvas: autosave would write it over the note that failed to open.
        setSpatialInitialData({ status: "unreadable", reason: "invalid" });
      } finally {
        if (requestId === loadRequestRef.current) {
          setIsHydratingDocument(false);
          setIsSpatialEditorReloading(false);
        }

        notesTrace("notes-workspace", "hydrateDocument:complete", {
          documentId,
          requestId,
        });
      }
    },
    [
      clearPendingLinearEdit,
      mediaWorker,
      recycleSpatialEditor,
      activeObjectUrlsRef,
      latestSpatialSceneVersionRef,
      latestSpatialSnapshotRef,
      linearSaveTimeoutRef,
      loadRequestRef,
      pendingSpatialSceneVersionRef,
      persistedFileIdsRef,
      spatialSaveTimeoutRef,
      resetLinearContent,
    ],
  );

  return {
    hydrateDocument,
    isHydratingDocument,
    spatialInitialData,
    isSpatialEditorReloading,
    spatialEditorReloadKey,
  };
}
