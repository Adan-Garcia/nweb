import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { serializeAsJSON } from "@excalidraw/excalidraw"
import type {
  BinaryFileData,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types"

import { createMediaWorkerClient } from "@/lib/media-worker-client"
import {
  DEFAULT_NOTES_DOCUMENT_ID,
  listNotesDirectoryEntries,
  loadNotesDocument,
  revokeObjectUrls,
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "@/lib/notes-storage"
import {
  buildNotesDocumentId,
  createDefaultNotesLocation,
  defaultLinearContent,
  sanitizeLocationSegment,
} from "@/components/notes/constants"
import {
  collectReferencedFileIds,
  convertSceneFilesForStorage,
  isImageFile,
} from "@/components/notes/scene-utils"
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
  NotesMode,
  NotesSpatialInitialData,
  SpatialSnapshot,
} from "@/components/notes/types"

type HandleSpatialChange = NonNullable<ExcalidrawProps["onChange"]>
type HandleSpatialPaste = NonNullable<ExcalidrawProps["onPaste"]>

const FALLBACK_LOCATION = createDefaultNotesLocation()

function toLocation(entry: NotesDirectoryEntry): NotesHierarchyLocation {
  return {
    wing: entry.wing,
    flight: entry.flight,
    branch: entry.branch,
    nest: entry.nest,
    feather: entry.feather,
  }
}

function normalizeLocation(location: NotesHierarchyLocation): NotesHierarchyLocation {
  return {
    wing: sanitizeLocationSegment(location.wing) || FALLBACK_LOCATION.wing,
    flight: sanitizeLocationSegment(location.flight) || FALLBACK_LOCATION.flight,
    branch: sanitizeLocationSegment(location.branch) || FALLBACK_LOCATION.branch,
    nest: sanitizeLocationSegment(location.nest) || FALLBACK_LOCATION.nest,
    feather: sanitizeLocationSegment(location.feather) || FALLBACK_LOCATION.feather,
  }
}

export function useNotesWorkspace() {
  const mediaWorker = useMemo(() => createMediaWorkerClient(), [])

  const [mode, setMode] = useState<NotesMode>("linear")
  const [linearContent, setLinearContent] = useState(defaultLinearContent)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [isHydratingDocument, setIsHydratingDocument] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [optimizedAssetCount, setOptimizedAssetCount] = useState(0)
  const [spatialInitialData, setSpatialInitialData] =
    useState<NotesSpatialInitialData>(null)
  const [directoryEntries, setDirectoryEntries] = useState<NotesDirectoryEntry[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [activeCreatedMode, setActiveCreatedMode] = useState<NotesDocumentMode>("linear")
  const [activeLocation, setActiveLocation] =
    useState<NotesHierarchyLocation>(FALLBACK_LOCATION)

  const spatialHostRef = useRef<HTMLDivElement | null>(null)
  const linearSaveTimeoutRef = useRef<number | null>(null)
  const spatialSaveTimeoutRef = useRef<number | null>(null)
  const latestSpatialSnapshotRef = useRef<SpatialSnapshot | null>(null)
  const activeObjectUrlsRef = useRef<string[]>([])
  const loadRequestRef = useRef(0)

  const refreshDirectoryEntries = useCallback(async () => {
    const entries = await listNotesDirectoryEntries()
    setDirectoryEntries(entries)

    return entries
  }, [])

  const optimizeImageBlob = useCallback(
    async (blob: Blob) => {
      return await mediaWorker.optimizeImageBlob(blob)
    },
    [mediaWorker],
  )

  const processIncomingImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(isImageFile)
      if (!imageFiles.length) {
        return
      }

      const optimizedFiles = await Promise.all(
        imageFiles.map(async (file) => {
          return await mediaWorker.optimizeImageFile(file)
        }),
      )

      setOptimizedAssetCount((currentCount) => currentCount + optimizedFiles.length)
    },
    [mediaWorker],
  )

  const persistLinearContent = useCallback(
    async (content: string, documentId: string, createdMode?: NotesDocumentMode) => {
      const compressed = await mediaWorker.compressText(content)

      await saveLinearDocumentPayload({
        documentId,
        createdMode,
        compressionAlgorithm: compressed.algorithm,
        compressed: compressed.bytes,
      })

      setLastSavedAt(Date.now())
    },
    [mediaWorker],
  )

  const persistSpatialSnapshot = useCallback(async (
    documentId: string,
    createdMode?: NotesDocumentMode,
  ) => {
    const snapshot = latestSpatialSnapshotRef.current

    if (!snapshot) {
      return
    }

    const referencedFileIds = collectReferencedFileIds(snapshot.elements)

    const serializedScene = serializeAsJSON(
      snapshot.elements,
      snapshot.appState,
      {},
      "database",
    )

    const compressedScene = await mediaWorker.compressText(serializedScene)

    const persistedFiles = await convertSceneFilesForStorage({
      files: snapshot.files,
      referencedFileIds,
      optimizeImageBlob,
    })

    await saveSpatialDocumentPayload({
      documentId,
      createdMode,
      compressionAlgorithm: compressedScene.algorithm,
      compressed: compressedScene.bytes,
      files: persistedFiles,
    })

    setLastSavedAt(Date.now())
  }, [mediaWorker, optimizeImageBlob])

  const scheduleSpatialPersist = useCallback(() => {
    if (!isStorageReady || isHydratingDocument || !activeDocumentId) {
      return
    }

    if (spatialSaveTimeoutRef.current) {
      window.clearTimeout(spatialSaveTimeoutRef.current)
    }

    spatialSaveTimeoutRef.current = window.setTimeout(() => {
      void persistSpatialSnapshot(activeDocumentId, activeCreatedMode)
    }, 900)
  }, [
    activeCreatedMode,
    activeDocumentId,
    isHydratingDocument,
    isStorageReady,
    persistSpatialSnapshot,
  ])

  const handleSpatialChange = useCallback<HandleSpatialChange>(
    (elements, appState, files) => {
      latestSpatialSnapshotRef.current = {
        elements,
        appState,
        files,
      }

      scheduleSpatialPersist()
    },
    [scheduleSpatialPersist],
  )

  const handleSpatialPaste = useCallback<HandleSpatialPaste>(
    (_clipboardData, event) => {
      if (!event?.clipboardData) {
        return false
      }

      const files = Array.from(event.clipboardData.files)
      if (files.length) {
        void processIncomingImageFiles(files)
      }

      return false
    },
    [processIncomingImageFiles],
  )

  const hydrateDocument = useCallback(
    async (documentId: string) => {
      const requestId = ++loadRequestRef.current
      setIsHydratingDocument(true)

      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current)
      }

      if (spatialSaveTimeoutRef.current) {
        window.clearTimeout(spatialSaveTimeoutRef.current)
      }

      latestSpatialSnapshotRef.current = null

      try {
        const loadedDocument = await loadNotesDocument(documentId)

        if (requestId !== loadRequestRef.current) {
          return
        }

        if (
          loadedDocument?.document.linearCompressed &&
          loadedDocument.document.linearCompressionAlgorithm
        ) {
          const decompressedLinear = await mediaWorker.decompressText(
            loadedDocument.document.linearCompressed,
            loadedDocument.document.linearCompressionAlgorithm,
          )

          if (requestId === loadRequestRef.current) {
            setLinearContent(decompressedLinear)
          }
        } else {
          setLinearContent(defaultLinearContent)
        }

        if (
          loadedDocument?.document.sceneCompressed &&
          loadedDocument.document.sceneCompressionAlgorithm
        ) {
          const decompressedScene = await mediaWorker.decompressText(
            loadedDocument.document.sceneCompressed,
            loadedDocument.document.sceneCompressionAlgorithm,
          )

          if (requestId !== loadRequestRef.current) {
            return
          }

          const parsedScene = JSON.parse(decompressedScene) as {
            elements?: Parameters<HandleSpatialChange>[0]
            appState?: Partial<Parameters<HandleSpatialChange>[1]>
          }

          const restoredFiles: Parameters<HandleSpatialChange>[2] = {}

          for (const loadedFile of Object.values(loadedDocument.sceneFiles)) {
            restoredFiles[loadedFile.id] = {
              id: loadedFile.id as BinaryFileData["id"],
              mimeType: loadedFile.mimeType as BinaryFileData["mimeType"],
              dataURL: loadedFile.objectUrl as BinaryFileData["dataURL"],
              created: loadedFile.created,
            } as BinaryFileData
          }

          revokeObjectUrls(activeObjectUrlsRef.current)
          activeObjectUrlsRef.current = loadedDocument.objectUrls

          setSpatialInitialData({
            elements: parsedScene.elements ?? [],
            appState: parsedScene.appState ?? {},
            files: restoredFiles,
          } satisfies ExcalidrawInitialDataState)
        } else {
          revokeObjectUrls(activeObjectUrlsRef.current)
          activeObjectUrlsRef.current = []
          setSpatialInitialData(null)
        }
      } catch {
        if (requestId !== loadRequestRef.current) {
          return
        }

        revokeObjectUrls(activeObjectUrlsRef.current)
        activeObjectUrlsRef.current = []
        setLinearContent(defaultLinearContent)
        setSpatialInitialData(null)
      } finally {
        if (requestId === loadRequestRef.current) {
          setIsHydratingDocument(false)
        }
      }
    },
    [mediaWorker],
  )

  const openDocumentById = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        return
      }

      if (isStorageReady && activeDocumentId && activeDocumentId !== documentId) {
        await persistLinearContent(linearContent, activeDocumentId, activeCreatedMode)
        await persistSpatialSnapshot(activeDocumentId, activeCreatedMode)
      }

      const entry = directoryEntries.find((candidate) => candidate.id === documentId)

      if (entry) {
        setActiveLocation(toLocation(entry))
        setActiveCreatedMode(entry.createdMode)
        setMode(entry.createdMode)
      }

      setActiveDocumentId(documentId)
      await hydrateDocument(documentId)
    },
    [
      activeDocumentId,
      directoryEntries,
      hydrateDocument,
      isStorageReady,
      linearContent,
      activeCreatedMode,
      persistLinearContent,
      persistSpatialSnapshot,
    ],
  )

  const createOrOpenDocumentAtLocation = useCallback(
    async (
      location: NotesHierarchyLocation,
      preferredMode?: NotesDocumentMode,
    ) => {
      const normalizedLocation = normalizeLocation(location)
      const documentId = buildNotesDocumentId(normalizedLocation)
      const targetMode = preferredMode ?? mode

      if (isStorageReady && activeDocumentId && activeDocumentId !== documentId) {
        await persistLinearContent(linearContent, activeDocumentId, activeCreatedMode)
        await persistSpatialSnapshot(activeDocumentId, activeCreatedMode)
      }

      await upsertNotesDirectoryEntry({
        id: documentId,
        location: normalizedLocation,
        createdMode: targetMode,
      })

      const nextEntries = await refreshDirectoryEntries()
      const createdEntry = nextEntries.find((entry) => entry.id === documentId)

      setActiveDocumentId(documentId)
      setActiveLocation(createdEntry ? toLocation(createdEntry) : normalizedLocation)
      setActiveCreatedMode(createdEntry?.createdMode ?? targetMode)
      setMode(createdEntry?.createdMode ?? targetMode)
      await hydrateDocument(documentId)
    },
    [
      activeDocumentId,
      activeCreatedMode,
      hydrateDocument,
      isStorageReady,
      linearContent,
      mode,
      persistLinearContent,
      persistSpatialSnapshot,
      refreshDirectoryEntries,
    ],
  )

  const saveActiveDocumentNow = useCallback(async () => {
    if (!isStorageReady || !activeDocumentId) {
      return
    }

    await persistLinearContent(linearContent, activeDocumentId, activeCreatedMode)
    await persistSpatialSnapshot(activeDocumentId, activeCreatedMode)
    await touchNotesDirectoryEntry(activeDocumentId, activeCreatedMode)
    await refreshDirectoryEntries()
  }, [
    activeDocumentId,
    activeCreatedMode,
    isStorageReady,
    linearContent,
    persistLinearContent,
    persistSpatialSnapshot,
    refreshDirectoryEntries,
  ])

  useEffect(() => {
    let isMounted = true

    const hydrateNotes = async () => {
      try {
        let existingEntries = await listNotesDirectoryEntries()

        if (!existingEntries.length) {
          const legacyDocument = await loadNotesDocument(DEFAULT_NOTES_DOCUMENT_ID)

          if (legacyDocument) {
            await upsertNotesDirectoryEntry({
              id: DEFAULT_NOTES_DOCUMENT_ID,
              location: {
                ...FALLBACK_LOCATION,
                feather: "Legacy note",
              },
              createdMode: "linear",
            })

            revokeObjectUrls(legacyDocument.objectUrls)
          } else {
            const initialDocumentId = buildNotesDocumentId(FALLBACK_LOCATION)

            await upsertNotesDirectoryEntry({
              id: initialDocumentId,
              location: FALLBACK_LOCATION,
              createdMode: "linear",
            })
          }

          existingEntries = await listNotesDirectoryEntries()
        }

        if (!isMounted || !existingEntries.length) {
          return
        }

        const initialEntry = existingEntries[0]

        setDirectoryEntries(existingEntries)
        setActiveDocumentId(initialEntry.id)
        setActiveCreatedMode(initialEntry.createdMode)
        setActiveLocation(toLocation(initialEntry))
        setMode(initialEntry.createdMode)
        await hydrateDocument(initialEntry.id)
      } catch {
        return
      } finally {
        if (isMounted) {
          setIsStorageReady(true)
        }
      }
    }

    void hydrateNotes()

    return () => {
      isMounted = false
    }
  }, [hydrateDocument])

  useEffect(() => {
    if (!activeDocumentId) {
      return
    }

    const matchedEntry = directoryEntries.find((entry) => entry.id === activeDocumentId)

    if (!matchedEntry) {
      return
    }

    setActiveCreatedMode(matchedEntry.createdMode)
  }, [activeDocumentId, directoryEntries])

  useEffect(() => {
    if (!isStorageReady || !activeDocumentId || isHydratingDocument) {
      return
    }

    if (linearSaveTimeoutRef.current) {
      window.clearTimeout(linearSaveTimeoutRef.current)
    }

    linearSaveTimeoutRef.current = window.setTimeout(() => {
      void persistLinearContent(linearContent, activeDocumentId, activeCreatedMode)
    }, 700)

    return () => {
      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current)
      }
    }
  }, [
    activeDocumentId,
    activeCreatedMode,
    isHydratingDocument,
    isStorageReady,
    linearContent,
    persistLinearContent,
  ])

  useEffect(() => {
    if (mode !== "spatial") {
      return
    }

    const hostElement = spatialHostRef.current
    if (!hostElement) {
      return
    }

    const handleDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length) {
        void processIncomingImageFiles(files)
      }
    }

    hostElement.addEventListener("drop", handleDrop, true)

    return () => {
      hostElement.removeEventListener("drop", handleDrop, true)
    }
  }, [mode, processIncomingImageFiles])

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1

      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current)
      }

      if (spatialSaveTimeoutRef.current) {
        window.clearTimeout(spatialSaveTimeoutRef.current)
      }

      mediaWorker.dispose()
      revokeObjectUrls(activeObjectUrlsRef.current)
    }
  }, [mediaWorker])

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
    spatialHostRef,
    createOrOpenDocumentAtLocation,
    openDocumentById,
    refreshDirectoryEntries,
    saveActiveDocumentNow,
    handleSpatialChange,
    handleSpatialPaste,
  }
}