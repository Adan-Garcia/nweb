import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";

import { createMediaWorkerClient } from "@/lib/media-worker-client";
import { notesTrace, notesTraceError } from "@/lib/notes-trace";
import {
  DEFAULT_NOTES_DOCUMENT_ID,
  listNotesDirectoryEntries,
  loadNotesDocument,
  revokeObjectUrls,
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "@/lib/notes-storage";
import {
  buildNotesDocumentId,
  createDefaultNotesLocation,
  defaultLinearContent,
  sanitizeLocationSegment,
} from "@/components/notes/constants";
import {
  collectReferencedFileIds,
  convertSceneFilesForStorage,
  isImageFile,
} from "@/components/notes/scene-utils";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
  NotesMode,
  NotesSpatialInitialData,
  SpatialSnapshot,
} from "@/components/notes/types";

type HandleSpatialChange = NonNullable<ExcalidrawProps["onChange"]>;
type HandleSpatialPaste = NonNullable<ExcalidrawProps["onPaste"]>;

const FALLBACK_LOCATION = createDefaultNotesLocation();

function toLocation(entry: NotesDirectoryEntry): NotesHierarchyLocation {
  return {
    wing: entry.wing,
    flight: entry.flight,
    branch: entry.branch,
    nest: entry.nest,
    feather: entry.feather,
  };
}

function normalizeLocation(
  location: NotesHierarchyLocation,
): NotesHierarchyLocation {
  return {
    wing: sanitizeLocationSegment(location.wing) || FALLBACK_LOCATION.wing,
    flight:
      sanitizeLocationSegment(location.flight) || FALLBACK_LOCATION.flight,
    branch:
      sanitizeLocationSegment(location.branch) || FALLBACK_LOCATION.branch,
    nest: sanitizeLocationSegment(location.nest) || FALLBACK_LOCATION.nest,
    feather:
      sanitizeLocationSegment(location.feather) || FALLBACK_LOCATION.feather,
  };
}

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
  const [optimizedAssetCount, setOptimizedAssetCount] = useState(0);
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
  const documentSwitchQueueRef = useRef<Promise<void>>(Promise.resolve());

  const runInDocumentSwitchQueue = useCallback(
    async (
      context: "openDocumentById" | "createOrOpenDocumentAtLocation",
      operation: () => Promise<void>,
    ) => {
      const previousOperation = documentSwitchQueueRef.current;
      let releaseCurrentOperation: () => void = () => {};

      const currentOperation = new Promise<void>((resolve) => {
        releaseCurrentOperation = resolve;
      });

      documentSwitchQueueRef.current = previousOperation.then(
        () => currentOperation,
      );

      notesTrace("notes-workspace", "document-switch:queued", {
        context,
      });

      await previousOperation;

      notesTrace("notes-workspace", "document-switch:running", {
        context,
      });

      try {
        await operation();
      } finally {
        releaseCurrentOperation();

        notesTrace("notes-workspace", "document-switch:complete", {
          context,
        });
      }
    },
    [],
  );

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

  const processIncomingImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(isImageFile);
      if (!imageFiles.length) {
        return;
      }

      const optimizedFiles = await Promise.all(
        imageFiles.map(async (file) => {
          return await mediaWorker.optimizeImageFile(file);
        }),
      );

      setOptimizedAssetCount(
        (currentCount) => currentCount + optimizedFiles.length,
      );
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

  const handleSpatialPaste = useCallback<HandleSpatialPaste>(
    (_clipboardData, event) => {
      if (!event?.clipboardData) {
        return false;
      }

      const files = Array.from(event.clipboardData.files);
      if (files.length) {
        void processIncomingImageFiles(files);
      }

      return false;
    },
    [processIncomingImageFiles],
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

          const parsedScene = JSON.parse(decompressedScene) as {
            elements?: Parameters<HandleSpatialChange>[0];
            appState?: Partial<Parameters<HandleSpatialChange>[1]>;
          };

          const restoredFiles: Parameters<HandleSpatialChange>[2] = {};

          for (const loadedFile of Object.values(loadedDocument.sceneFiles)) {
            restoredFiles[loadedFile.id] = {
              id: loadedFile.id as BinaryFileData["id"],
              mimeType: loadedFile.mimeType as BinaryFileData["mimeType"],
              dataURL: loadedFile.dataUrl as BinaryFileData["dataURL"],
              created: loadedFile.created,
            } as BinaryFileData;
          }

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
            elements: parsedScene.elements ?? [],
            appState: parsedScene.appState ?? {},
            files: restoredFiles,
          } satisfies ExcalidrawInitialDataState);
          latestSpatialSceneVersionRef.current = getSceneVersion(
            parsedScene.elements ?? [],
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

  const openDocumentById = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        return;
      }

      await runInDocumentSwitchQueue("openDocumentById", async () => {
        if (
          isStorageReady &&
          activeDocumentId &&
          activeDocumentId !== documentId
        ) {
          const snapshotForSwitch = latestSpatialSnapshotRef.current;
          const snapshotVersionForSwitch =
            pendingSpatialSceneVersionRef.current;

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
                "openDocumentById:preswitch-linear-save-failed",
                error,
                {
                  fromDocumentId: activeDocumentId,
                  toDocumentId: documentId,
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
                "openDocumentById:preswitch-spatial-save-failed",
                error,
                {
                  fromDocumentId: activeDocumentId,
                  toDocumentId: documentId,
                },
              );
            }
          }
        }

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
      activeDocumentId,
      directoryEntries,
      hydrateDocument,
      isStorageReady,
      activeCreatedMode,
      persistLinearContent,
      persistSpatialSnapshot,
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
          if (
            isStorageReady &&
            activeDocumentId &&
            activeDocumentId !== documentId
          ) {
            const snapshotForSwitch = latestSpatialSnapshotRef.current;
            const snapshotVersionForSwitch =
              pendingSpatialSceneVersionRef.current;

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
                  "createOrOpenDocumentAtLocation:preswitch-linear-save-failed",
                  error,
                  {
                    fromDocumentId: activeDocumentId,
                    toDocumentId: documentId,
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
                  "createOrOpenDocumentAtLocation:preswitch-spatial-save-failed",
                  error,
                  {
                    fromDocumentId: activeDocumentId,
                    toDocumentId: documentId,
                  },
                );
              }
            }
          }

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
      activeDocumentId,
      activeCreatedMode,
      hydrateDocument,
      isStorageReady,
      mode,
      persistLinearContent,
      persistSpatialSnapshot,
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
    if (mode !== "spatial") {
      return;
    }

    const hostElement = spatialHostRef.current;
    if (!hostElement) {
      return;
    }

    const handleDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) {
        void processIncomingImageFiles(files);
      }
    };

    hostElement.addEventListener("drop", handleDrop, true);

    return () => {
      hostElement.removeEventListener("drop", handleDrop, true);
    };
  }, [mode, processIncomingImageFiles]);

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
