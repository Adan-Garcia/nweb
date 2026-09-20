import type { ExcalidrawInitialDataState, ExcalidrawProps } from "@excalidraw/excalidraw/types";

import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "@/lib/notes-model";

export type NotesMode = NotesDocumentMode;

export type SceneElements = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0];
export type SceneAppState = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[1];
export type SceneFiles = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[2];

export type SpatialSnapshot = {
  elements: SceneElements;
  appState: SceneAppState;
  files: SceneFiles;
};

export type NotesSpatialInitialData = ExcalidrawInitialDataState | null;

export type { NotesDirectoryEntry, NotesDocumentMode, NotesHierarchyLocation };
