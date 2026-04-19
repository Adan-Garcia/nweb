import type {
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types"
import type {
  NotesDocumentMode,
  NotesDirectoryEntry,
  NotesHierarchyLocation,
} from "@/lib/notes-storage"

export type NotesMode = NotesDocumentMode

export type SceneElements = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0]
export type SceneAppState = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[1]
export type SceneFiles = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[2]

export type SpatialSnapshot = {
  elements: SceneElements
  appState: SceneAppState
  files: SceneFiles
}

export type NotesSpatialInitialData = ExcalidrawInitialDataState | null

export type { NotesHierarchyLocation, NotesDirectoryEntry, NotesDocumentMode }