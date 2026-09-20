import { useCallback } from "react";
import { getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import {
  collectReferencedFileIds,
  convertSceneFilesForStorage,
} from "@/components/notes/scene-utils";
import type {
  NotesDocumentMode,
  SpatialSnapshot,
} from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import type { MediaWorkerClient } from "@/lib/media-worker-client";
import { saveSpatialDocumentPayload } from "@/lib/notes-document-storage";
import { notesTrace } from "@/lib/notes-trace";

type HandleSpatialChange = NonNullable<ExcalidrawProps["onChange"]>;

type UseSpatialAutosaveOptions = {
  refs: NotesSessionRefs;
  mediaWorker: MediaWorkerClient;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
  activeDocumentId: string | null;
  activeCreatedMode: NotesDocumentMode;
  markSaved: () => void;
};

/** Tracks Excalidraw scene changes and persists them, debounced. */
export function useSpatialAutosave({
  refs,
  mediaWorker,
  isStorageReady,
  isHydratingDocument,
  activeDocumentId,
  activeCreatedMode,
  markSaved,
}: UseSpatialAutosaveOptions) {
  const { latestSpatialSceneVersionRef, latestSpatialSnapshotRef, pendingSpatialSceneVersionRef, spatialSaveTimeoutRef } = refs;
  const optimizeImageBlob = useCallback(
    async (blob: Blob) => {
      return await mediaWorker.optimizeImageBlob(blob);
    },
    [mediaWorker],
  );

  const persistSpatialSnapshot = useCallback(
    async (
      documentId: string,
      createdMode?: NotesDocumentMode,
      snapshotOverride?: SpatialSnapshot | null,
      snapshotVersionOverride?: number | null,
    ) => {
      const snapshot = snapshotOverride ?? latestSpatialSnapshotRef.current;
      const snapshotVersion =
        snapshotVersionOverride ?? pendingSpatialSceneVersionRef.current;

      if (!snapshot) {
        return;
      }

      const referencedFileIds = collectReferencedFileIds(snapshot.elements);

      notesTrace("notes-workspace", "persistSpatialSnapshot:start", {
        documentId,
        createdMode,
        snapshotVersion,
        elementCount: snapshot.elements.length,
        sceneFileCount: Object.keys(snapshot.files).length,
        referencedFileCount: referencedFileIds.size,
      });

      const serializedScene = serializeAsJSON(
        snapshot.elements,
        snapshot.appState,
        {},
        "database",
      );

      const compressedScene = await mediaWorker.compressText(serializedScene);

      const persistedFiles = await convertSceneFilesForStorage({
        files: snapshot.files,
        referencedFileIds,
        optimizeImageBlob,
      });

      notesTrace("notes-workspace", "persistSpatialSnapshot:files-converted", {
        documentId,
        referencedFileCount: referencedFileIds.size,
        persistedFileCount: persistedFiles.length,
        persistedMimeTypes: persistedFiles.map((file) => file.mimeType),
      });

      await saveSpatialDocumentPayload({
        documentId,
        createdMode,
        compressionAlgorithm: compressedScene.algorithm,
        compressed: compressedScene.bytes,
        files: persistedFiles,
        referencedFileIds: Array.from(referencedFileIds),
      });

      notesTrace("notes-workspace", "persistSpatialSnapshot:stored", {
        documentId,
        persistedFileCount: persistedFiles.length,
      });

      markSaved();

      if (pendingSpatialSceneVersionRef.current === snapshotVersion) {
        pendingSpatialSceneVersionRef.current = null;
      }
    },
    [markSaved, mediaWorker, optimizeImageBlob, latestSpatialSnapshotRef, pendingSpatialSceneVersionRef],
  );

  const scheduleSpatialPersist = useCallback(() => {
    if (
      !isStorageReady ||
      isHydratingDocument ||
      !activeDocumentId ||
      pendingSpatialSceneVersionRef.current === null
    ) {
      return;
    }

    if (spatialSaveTimeoutRef.current) {
      window.clearTimeout(spatialSaveTimeoutRef.current);
    }

    const snapshotForScheduledSave = latestSpatialSnapshotRef.current;
    const snapshotVersionForScheduledSave =
      pendingSpatialSceneVersionRef.current;

    spatialSaveTimeoutRef.current = window.setTimeout(() => {
      void persistSpatialSnapshot(
        activeDocumentId,
        activeCreatedMode,
        snapshotForScheduledSave,
        snapshotVersionForScheduledSave,
      );
    }, 500);
  }, [
    activeCreatedMode,
    activeDocumentId,
    isHydratingDocument,
    isStorageReady,
    persistSpatialSnapshot,
    latestSpatialSnapshotRef,
    pendingSpatialSceneVersionRef,
    spatialSaveTimeoutRef,
  ]);

  const handleSpatialChange = useCallback<HandleSpatialChange>(
    (elements, appState, files) => {
      const sceneVersion = getSceneVersion(elements);

      latestSpatialSnapshotRef.current = {
        elements,
        appState,
        files,
      };

      if (sceneVersion === latestSpatialSceneVersionRef.current) {
        return;
      }

      const referencedFileIds = collectReferencedFileIds(elements);

      notesTrace("notes-workspace", "handleSpatialChange:scene-updated", {
        sceneVersion,
        elementCount: elements.length,
        totalSceneFiles: Object.keys(files).length,
        referencedFileCount: referencedFileIds.size,
      });

      latestSpatialSceneVersionRef.current = sceneVersion;
      pendingSpatialSceneVersionRef.current = sceneVersion;

      scheduleSpatialPersist();
    },
    [latestSpatialSceneVersionRef, latestSpatialSnapshotRef, pendingSpatialSceneVersionRef, scheduleSpatialPersist],
  );

  return { persistSpatialSnapshot, handleSpatialChange };
}
