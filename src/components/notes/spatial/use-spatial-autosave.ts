import { useCallback } from "react";

import type { NotesDocumentMode, SpatialSnapshot } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { referencedFileIds } from "@/lib/canvas/scene-edits";
import { createScene, type SceneLayout, serializeScene } from "@/lib/canvas/scene-model";
import type { MediaWorkerClient } from "@/lib/media/media-worker-client";
import { saveSpatialDocumentPayload } from "@/lib/notes/notes-document-storage";
import type { PersistedSceneFile } from "@/lib/notes/notes-model";
import { notesTrace } from "@/lib/notes/notes-trace";

type UseSpatialAutosaveOptions = {
  refs: NotesSessionRefs;
  mediaWorker: MediaWorkerClient;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
  activeDocumentId: string | null;
  activeCreatedMode: NotesDocumentMode;
  markSaved: () => void;
};

/** Tracks the canvas's changes and persists them, debounced. */
export function useSpatialAutosave({
  refs,
  mediaWorker,
  isStorageReady,
  isHydratingDocument,
  activeDocumentId,
  activeCreatedMode,
  markSaved,
}: UseSpatialAutosaveOptions) {
  const {
    latestSpatialSceneVersionRef,
    latestSpatialSnapshotRef,
    pendingSpatialSceneVersionRef,
    persistedFileIdsRef,
    spatialSaveTimeoutRef,
  } = refs;

  const persistSpatialSnapshot = useCallback(
    async (
      documentId: string,
      createdMode?: NotesDocumentMode,
      snapshotOverride?: SpatialSnapshot | null,
      snapshotVersionOverride?: number | null,
      announce = true,
    ) => {
      const snapshot = snapshotOverride ?? latestSpatialSnapshotRef.current;
      const snapshotVersion = snapshotVersionOverride ?? pendingSpatialSceneVersionRef.current;

      if (!snapshot) {
        return;
      }

      const referenced = referencedFileIds(snapshot.scene);
      // Only files added since the note was opened carry a blob, and only those not yet
      // written need writing; the storage keeps the rest because they are still referenced.
      const newFiles: PersistedSceneFile[] = [...snapshot.files.values()].flatMap((file) =>
        file.blob && referenced.has(file.id) && !persistedFileIdsRef.current.has(file.id)
          ? [{ id: file.id, blob: file.blob, mimeType: file.mimeType, created: file.created }]
          : [],
      );

      notesTrace("notes-workspace", "persistSpatialSnapshot:start", {
        documentId,
        createdMode,
        snapshotVersion,
        elementCount: snapshot.scene.elements.length,
        newFileCount: newFiles.length,
        referencedFileCount: referenced.size,
      });

      const compressedScene = await mediaWorker.compressText(serializeScene(snapshot.scene));

      await saveSpatialDocumentPayload({
        documentId,
        createdMode,
        compressionAlgorithm: compressedScene.algorithm,
        compressed: compressedScene.bytes,
        files: newFiles,
        referencedFileIds: Array.from(referenced),
      });

      for (const file of newFiles) {
        persistedFileIdsRef.current.add(file.id);
      }
      if (announce) {
        markSaved();
      }

      if (pendingSpatialSceneVersionRef.current === snapshotVersion) {
        pendingSpatialSceneVersionRef.current = null;
      }
    },
    [
      markSaved,
      mediaWorker,
      latestSpatialSnapshotRef,
      pendingSpatialSceneVersionRef,
      persistedFileIdsRef,
    ],
  );

  /**
   * Writes a new drawing note's first, empty scene, so it opens as the kind it was made.
   * Not announced as a save: nobody has written anything yet.
   */
  const writeNewScene = useCallback(
    async (documentId: string, layout: SceneLayout) => {
      await persistSpatialSnapshot(
        documentId,
        "spatial",
        { scene: createScene(layout), files: new Map(), revision: 0 },
        null,
        false,
      );
    },
    [persistSpatialSnapshot],
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
    const snapshotVersionForScheduledSave = pendingSpatialSceneVersionRef.current;

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

  const handleSpatialChange = useCallback(
    (snapshot: SpatialSnapshot) => {
      latestSpatialSnapshotRef.current = snapshot;

      if (snapshot.revision === latestSpatialSceneVersionRef.current) {
        return;
      }

      notesTrace("notes-workspace", "handleSpatialChange:scene-updated", {
        revision: snapshot.revision,
        elementCount: snapshot.scene.elements.length,
        fileCount: snapshot.files.size,
      });

      latestSpatialSceneVersionRef.current = snapshot.revision;
      pendingSpatialSceneVersionRef.current = snapshot.revision;

      scheduleSpatialPersist();
    },
    [
      latestSpatialSceneVersionRef,
      latestSpatialSnapshotRef,
      pendingSpatialSceneVersionRef,
      scheduleSpatialPersist,
    ],
  );

  return { persistSpatialSnapshot, handleSpatialChange, writeNewScene };
}
