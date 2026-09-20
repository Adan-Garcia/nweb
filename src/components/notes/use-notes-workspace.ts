import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";

import { createMediaWorkerClient } from "@/lib/media-worker-client";
import { notesTrace, notesTraceError } from "@/lib/notes-trace";
import { revokeObjectUrls } from "@/lib/blob-utils";
import {
  listNotesDirectoryEntries,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "@/lib/notes-directory-storage";
import {
  loadNotesDocument,
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
} from "@/lib/notes-document-storage";
import { DEFAULT_NOTES_DOCUMENT_ID } from "@/lib/notes-model";
import {
  buildNotesDocumentId,
  defaultLinearContent,
} from "@/components/notes/constants";
import {
  parseStoredScene,
  restoreSceneFiles,
} from "@/components/notes/excalidraw-adapter";
import {
  FALLBACK_LOCATION,
  normalizeLocation,
  toLocation,
} from "@/components/notes/location-hierarchy";
import {
  collectReferencedFileIds,
  convertSceneFilesForStorage,
} from "@/components/notes/scene-utils";
import { useDocumentSwitchQueue } from "@/components/notes/use-document-switch-queue";
import { useNotesImageIngest } from "@/components/notes/use-notes-image-ingest";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
  NotesMode,
  NotesSpatialInitialData,
  SpatialSnapshot,
} from "@/components/notes/types";

type HandleSpatialChange = NonNullable<ExcalidrawProps["onChange"]>;
export function useNotesWorkspace() {
  const mediaWorker = useMemo(() => createMediaWorkerClient(), []);

  const [mode, setMode] = useState<NotesMode>("linear");
  const [linearContent, setLinearContentState] = useState(defaultLinearContent);
  const [pendingLinearEditAt, setPendingLinearEditAt] = useState<number | null>(
    null,
  );
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isHydratingDocument, setIsHydratingDocument] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [spatialInitialData, setSpatialInitialData] =
    useState<NotesSpatialInitialData>(null);
  const [isSpatialEditorReloading, setIsSpatialEditorReloading] =
    useState(false);
  const [spatialEditorReloadKey, setSpatialEditorReloadKey] = useState(0);
  const [directoryEntries, setDirectoryEntries] = useState<
    NotesDirectoryEntry[]
  >([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeCreatedMode, setActiveCreatedMode] =
    useState<NotesDocumentMode>("linear");
  const [activeLocation, setActiveLocation] =
    useState<NotesHierarchyLocation>(FALLBACK_LOCATION);

  const spatialHostRef = useRef<HTMLDivElement | null>(null);
  const linearSaveTimeoutRef = useRef<number | null>(null);
  const spatialSaveTimeoutRef = useRef<number | null>(null);
  const latestSpatialSnapshotRef = useRef<SpatialSnapshot | null>(null);
  const latestLinearContentRef = useRef(defaultLinearContent);
  const pendingLinearEditAtRef = useRef<number | null>(null);
  const latestSpatialSceneVersionRef = useRef(0);
  const pendingSpatialSceneVersionRef = useRef<number | null>(null);
  const activeObjectUrlsRef = useRef<string[]>([]);
  const loadRequestRef = useRef(0);

  const runInDocumentSwitchQueue = useDocumentSwitchQueue();
  const { optimizedAssetCount, handleSpatialPaste } = useNotesImageIngest({
    mediaWorker,
    spatialHostRef,
    mode,
  });

  const refreshDirectoryEntries = useCallback(async () => {
    const entries = await listNotesDirectoryEntries();
    setDirectoryEntries(entries);

    return entries;
  }, []);

  const optimizeImageBlob = useCallback(
    async (blob: Blob) => {
      return await mediaWorker.optimizeImageBlob(blob);
    },
    [mediaWorker],
  );

  const setLinearContent = useCallback((nextContent: string) => {
    if (nextContent === latestLinearContentRef.current) {
      return;
    }

    latestLinearContentRef.current = nextContent;
    setLinearContentState(nextContent);

    const editAt = Date.now();
    pendingLinearEditAtRef.current = editAt;
    setPendingLinearEditAt(editAt);
  }, []);

  const persistLinearContent = useCallback(
    async (
      content: string,
      documentId: string,
      createdMode?: NotesDocumentMode,
    ) => {
      const compressed = await mediaWorker.compressText(content);

      await saveLinearDocumentPayload({
        documentId,
        createdMode,
        compressionAlgorithm: compressed.algorithm,
        compressed: compressed.bytes,
      });

      setLastSavedAt(Date.now());
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

      setLastSavedAt(Date.now());

      if (pendingSpatialSceneVersionRef.current === snapshotVersion) {
        pendingSpatialSceneVersionRef.current = null;
      }
    },
    [mediaWorker, optimizeImageBlob],
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
    [scheduleSpatialPersist],
  );

  const recycleSpatialEditor = useCallback(async () => {
    setIsSpatialEditorReloading(true);
    setSpatialInitialData(null);

    await new Promise<void>((resolve) => {
      if (
        typeof window === "undefined" ||
        typeof window.requestAnimationFrame !== "function"
      ) {
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

      pendingLinearEditAtRef.current = null;
      setPendingLinearEditAt(null);
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
            latestLinearContentRef.current = decompressedLinear;
            setLinearContentState(decompressedLinear);
          }
        } else {
          latestLinearContentRef.current = defaultLinearContent;
          setLinearContentState(defaultLinearContent);
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

          notesTrace(
            "notes-workspace",
            "hydrateDocument:restored-scene-files",
            {
              documentId,
              requestId,
              storedSceneFileRefs: loadedDocument.document.sceneFiles.length,
              restoredSceneFiles: Object.keys(restoredFiles).length,
              restoredMimeTypes: Object.values(loadedDocument.sceneFiles).map(
                (file) => file.mimeType,
              ),
            },
          );

          revokeObjectUrls(activeObjectUrlsRef.current);
          activeObjectUrlsRef.current = loadedDocument.objectUrls;

          setSpatialInitialData({
            elements: parsedScene.elements,
            appState: parsedScene.appState,
            files: restoredFiles,
          } satisfies ExcalidrawInitialDataState);
          latestSpatialSceneVersionRef.current = getSceneVersion(
            parsedScene.elements,
          );
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
        latestLinearContentRef.current = defaultLinearContent;
        setLinearContentState(defaultLinearContent);
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
    [mediaWorker, recycleSpatialEditor],
  );

  const persistActiveDocumentBeforeSwitch = useCallback(
    async (
      context: "openDocumentById" | "createOrOpenDocumentAtLocation",
      toDocumentId: string,
    ) => {
      if (
        !isStorageReady ||
        !activeDocumentId ||
        activeDocumentId === toDocumentId
      ) {
        return;
      }

      const snapshotForSwitch = latestSpatialSnapshotRef.current;
      const snapshotVersionForSwitch = pendingSpatialSceneVersionRef.current;

      if (pendingLinearEditAtRef.current !== null) {
        try {
          await persistLinearContent(
            latestLinearContentRef.current,
            activeDocumentId,
            activeCreatedMode,
          );
        } catch (error) {
          notesTraceError(
            "notes-workspace",
            `${context}:preswitch-linear-save-failed`,
            error,
            {
              fromDocumentId: activeDocumentId,
              toDocumentId,
            },
          );
        }

        pendingLinearEditAtRef.current = null;
        setPendingLinearEditAt(null);
      }

      if (snapshotForSwitch && snapshotVersionForSwitch !== null) {
        try {
          await persistSpatialSnapshot(
            activeDocumentId,
            activeCreatedMode,
            snapshotForSwitch,
            snapshotVersionForSwitch,
          );
        } catch (error) {
          notesTraceError(
            "notes-workspace",
            `${context}:preswitch-spatial-save-failed`,
            error,
            {
              fromDocumentId: activeDocumentId,
              toDocumentId,
            },
          );
        }
      }
    },
    [
      activeCreatedMode,
      activeDocumentId,
      isStorageReady,
      persistLinearContent,
      persistSpatialSnapshot,
    ],
  );

  const openDocumentById = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        return;
      }

      await runInDocumentSwitchQueue("openDocumentById", async () => {
        await persistActiveDocumentBeforeSwitch("openDocumentById", documentId);

        const entry = directoryEntries.find(
          (candidate) => candidate.id === documentId,
        );

        if (entry) {
          setActiveLocation(toLocation(entry));
          setActiveCreatedMode(entry.createdMode);
          setMode(entry.createdMode);
        }

        setActiveDocumentId(documentId);
        await hydrateDocument(documentId, entry?.createdMode);
      });
    },
    [
      directoryEntries,
      hydrateDocument,
      persistActiveDocumentBeforeSwitch,
      runInDocumentSwitchQueue,
    ],
  );

  const createOrOpenDocumentAtLocation = useCallback(
    async (
      location: NotesHierarchyLocation,
      preferredMode?: NotesDocumentMode,
    ) => {
      const normalizedLocation = normalizeLocation(location);
      const documentId = buildNotesDocumentId(normalizedLocation);
      const targetMode = preferredMode ?? mode;

      await runInDocumentSwitchQueue(
        "createOrOpenDocumentAtLocation",
        async () => {
          await persistActiveDocumentBeforeSwitch(
            "createOrOpenDocumentAtLocation",
            documentId,
          );

          await upsertNotesDirectoryEntry({
            id: documentId,
            location: normalizedLocation,
            createdMode: targetMode,
          });

          const nextEntries = await refreshDirectoryEntries();
          const createdEntry = nextEntries.find(
            (entry) => entry.id === documentId,
          );

          setActiveDocumentId(documentId);
          setActiveLocation(
            createdEntry ? toLocation(createdEntry) : normalizedLocation,
          );
          setActiveCreatedMode(createdEntry?.createdMode ?? targetMode);
          setMode(createdEntry?.createdMode ?? targetMode);
          await hydrateDocument(
            documentId,
            createdEntry?.createdMode ?? targetMode,
          );
        },
      );
    },
    [
      hydrateDocument,
      mode,
      persistActiveDocumentBeforeSwitch,
      refreshDirectoryEntries,
      runInDocumentSwitchQueue,
    ],
  );

  const saveActiveDocumentNow = useCallback(async () => {
    if (!isStorageReady || !activeDocumentId) {
      return;
    }

    const snapshotForManualSave = latestSpatialSnapshotRef.current;
    const snapshotVersionForManualSave = pendingSpatialSceneVersionRef.current;

    await persistLinearContent(
      latestLinearContentRef.current,
      activeDocumentId,
      activeCreatedMode,
    );
    if (snapshotForManualSave && snapshotVersionForManualSave !== null) {
      await persistSpatialSnapshot(
        activeDocumentId,
        activeCreatedMode,
        snapshotForManualSave,
        snapshotVersionForManualSave,
      );
    }
    pendingLinearEditAtRef.current = null;
    setPendingLinearEditAt(null);
    pendingSpatialSceneVersionRef.current = null;
    await touchNotesDirectoryEntry(activeDocumentId, activeCreatedMode);
    await refreshDirectoryEntries();
  }, [
    activeDocumentId,
    activeCreatedMode,
    isStorageReady,
    persistLinearContent,
    persistSpatialSnapshot,
    refreshDirectoryEntries,
  ]);

  useEffect(() => {
    let isMounted = true;

    const hydrateNotes = async () => {
      try {
        let existingEntries = await listNotesDirectoryEntries();

        if (!existingEntries.length) {
          const legacyDocument = await loadNotesDocument(
            DEFAULT_NOTES_DOCUMENT_ID,
          );

          if (legacyDocument) {
            await upsertNotesDirectoryEntry({
              id: DEFAULT_NOTES_DOCUMENT_ID,
              location: {
                ...FALLBACK_LOCATION,
                feather: "Legacy note",
              },
              createdMode: "linear",
            });

            revokeObjectUrls(legacyDocument.objectUrls);
          } else {
            const initialDocumentId = buildNotesDocumentId(FALLBACK_LOCATION);

            await upsertNotesDirectoryEntry({
              id: initialDocumentId,
              location: FALLBACK_LOCATION,
              createdMode: "linear",
            });
          }

          existingEntries = await listNotesDirectoryEntries();
        }

        if (!isMounted || !existingEntries.length) {
          return;
        }

        const initialEntry = existingEntries[0];

        setDirectoryEntries(existingEntries);
        setActiveDocumentId(initialEntry.id);
        setActiveCreatedMode(initialEntry.createdMode);
        setActiveLocation(toLocation(initialEntry));
        setMode(initialEntry.createdMode);
        await hydrateDocument(initialEntry.id, initialEntry.createdMode);
      } catch {
        return;
      } finally {
        if (isMounted) {
          setIsStorageReady(true);
        }
      }
    };

    void hydrateNotes();

    return () => {
      isMounted = false;
    };
  }, [hydrateDocument]);

  useEffect(() => {
    if (!activeDocumentId) {
      return;
    }

    const matchedEntry = directoryEntries.find(
      (entry) => entry.id === activeDocumentId,
    );

    if (!matchedEntry) {
      return;
    }

    setActiveCreatedMode(matchedEntry.createdMode);
  }, [activeDocumentId, directoryEntries]);

  useEffect(() => {
    if (
      !isStorageReady ||
      !activeDocumentId ||
      isHydratingDocument ||
      pendingLinearEditAt === null
    ) {
      return;
    }

    if (linearSaveTimeoutRef.current) {
      window.clearTimeout(linearSaveTimeoutRef.current);
    }

    const scheduledEditAt = pendingLinearEditAt;
    const contentForScheduledSave = latestLinearContentRef.current;

    linearSaveTimeoutRef.current = window.setTimeout(() => {
      if (pendingLinearEditAtRef.current !== scheduledEditAt) {
        return;
      }

      void persistLinearContent(
        contentForScheduledSave,
        activeDocumentId,
        activeCreatedMode,
      ).then(() => {
        if (pendingLinearEditAtRef.current === scheduledEditAt) {
          pendingLinearEditAtRef.current = null;
          setPendingLinearEditAt(null);
        }
      });
    }, 700);

    return () => {
      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current);
      }
    };
  }, [
    activeDocumentId,
    activeCreatedMode,
    isHydratingDocument,
    isStorageReady,
    pendingLinearEditAt,
    persistLinearContent,
  ]);

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1;

      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current);
      }

      if (spatialSaveTimeoutRef.current) {
        window.clearTimeout(spatialSaveTimeoutRef.current);
      }

      pendingLinearEditAtRef.current = null;
      pendingSpatialSceneVersionRef.current = null;

      mediaWorker.dispose();
      revokeObjectUrls(activeObjectUrlsRef.current);
    };
  }, [mediaWorker]);

  return {
    mode,
    setMode,
    directoryEntries,
    activeDocumentId,
    activeCreatedMode,
    activeLocation,
    isHydratingDocument,
    linearContent,
    setLinearContent,
    isStorageReady,
    lastSavedAt,
    optimizedAssetCount,
    spatialInitialData,
    isSpatialEditorReloading,
    spatialEditorReloadKey,
    spatialHostRef,
    createOrOpenDocumentAtLocation,
    openDocumentById,
    refreshDirectoryEntries,
    saveActiveDocumentNow,
    handleSpatialChange,
    handleSpatialPaste,
  };
}
