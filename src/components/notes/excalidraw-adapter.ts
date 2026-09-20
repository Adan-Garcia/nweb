import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import type {
  SceneAppState,
  SceneElements,
  SceneFiles,
} from "@/components/notes/types";
import type { LoadedSceneFile } from "@/lib/notes-model";

// The only place that talks to Excalidraw's opaque/branded persistence types.

export type StoredScene = {
  elements: SceneElements;
  appState: Partial<SceneAppState>;
};

/** Parses a serialized scene. Throws if it is not a JSON object. */
export function parseStoredScene(serialized: string): StoredScene {
  const parsed: unknown = JSON.parse(serialized);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Stored scene is not an object");
  }

  const scene = parsed as {
    elements?: SceneElements;
    appState?: Partial<SceneAppState>;
  };

  return {
    elements: scene.elements ?? [],
    appState: scene.appState ?? {},
  };
}

/** Rebuilds Excalidraw's file map from files loaded out of storage. */
export function restoreSceneFiles(
  loadedFiles: Record<string, LoadedSceneFile>,
): SceneFiles {
  const restoredFiles: SceneFiles = {};

  for (const loadedFile of Object.values(loadedFiles)) {
    restoredFiles[loadedFile.id] = {
      id: loadedFile.id as BinaryFileData["id"],
      mimeType: loadedFile.mimeType as BinaryFileData["mimeType"],
      dataURL: loadedFile.dataUrl as BinaryFileData["dataURL"],
      created: loadedFile.created,
    } as BinaryFileData;
  }

  return restoredFiles;
}
