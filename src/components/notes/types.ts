import type { CanvasFiles } from "@/lib/canvas/canvas-files";
import type { Scene } from "@/lib/canvas/scene-model";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "@/lib/notes/notes-model";

export type NotesMode = NotesDocumentMode;

/** What the spatial editor last reported: its scene, the files it draws, and a counter. */
export type SpatialSnapshot = {
  scene: Scene;
  files: CanvasFiles;
  /** Goes up by one per change; autosave compares it to know what it has written. */
  revision: number;
};

/** What a spatial note opens with: its drawing, or why it cannot be shown. */
export type NotesSpatialInitialData =
  | { status: "ready"; scene: Scene; files: CanvasFiles }
  | { status: "unreadable"; reason: "invalid" | "newer-format" };

export type { NotesDirectoryEntry, NotesDocumentMode, NotesHierarchyLocation };
