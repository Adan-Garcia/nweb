import { useCallback, useState } from "react";
import { getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

import { defaultLinearContent } from "@/components/notes/constants";
import { parseStoredScene, restoreSceneFiles } from "@/components/notes/excalidraw-adapter";
import type { NotesDocumentMode, NotesSpatialInitialData } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { revokeObjectUrls } from "@/lib/blob-utils";
import type { MediaWorkerClient } from "@/lib/media-worker-client";
import { loadNotesDocument } from "@/lib/notes-document-storage";
import { notesTrace, notesTraceError } from "@/lib/notes-trace";

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
    spatialSaveTimeoutRef,
  } = refs;
  const [isHydratingDocument, setIsHydratingDocument] = useState(false);
  const [spatialInitialData, setSpatialInitialData] = useState<NotesSpatialInitialData>(null);
  const [isSpatialEditorReloading, setIsSpatialEditorReloading] = useState(false);
  const [spatialEditorReloadKey, setSpatialEditorReloadKey] = useState(0);

  const recycleSpatialEditor = useCallback(async () => {
    setIsSpatialEditorReloading(true);
    setSpatialInitialData(null);

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

          const parsedScene = parseStoredScene(decompressedScene);
          const restoredFiles = restoreSceneFiles(loadedDocument.sceneFiles);

          notesTrace("notes-workspace", "hydrateDocument:restored-scene-files", {
            documentId,
            requestId,
            storedSceneFileRefs: loadedDocument.document.sceneFiles.length,
            restoredSceneFiles: Object.keys(restoredFiles).length,
            restoredMimeTypes: Object.values(loadedDocument.sceneFiles).map(
              (file) => file.mimeType,
            ),
          });

          revokeObjectUrls(activeObjectUrlsRef.current);
          activeObjectUrlsRef.current = loadedDocument.objectUrls;

          setSpatialInitialData({
            elements: parsedScene.elements,
            appState: parsedScene.appState,
            files: restoredFiles,
          } satisfies ExcalidrawInitialDataState);
          latestSpatialSceneVersionRef.current = getSceneVersion(parsedScene.elements);
        } else {
          revokeObjectUrls(activeObjectUrlsRef.current);
          activeObjectUrlsRef.current = [];
          setSpatialInitialData(null);
          latestSpatialSceneVersionRef.current = 0;
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
        setSpatialInitialData(null);
        latestSpatialSceneVersionRef.current = 0;
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
