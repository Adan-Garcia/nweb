import { useEffect, useMemo, useRef } from "react";

import { defaultLinearContent } from "@/components/notes/constants";
import type { SpatialSnapshot } from "@/components/notes/types";
import { revokeObjectUrls } from "@/lib/media/blob-utils";
import { createMediaWorkerClient } from "@/lib/media/media-worker-client";

/**
 * Mutable, non-rendering state shared by the notes hooks (timers, latest
 * values, in-flight request ids). The object identity is stable for the
 * lifetime of the component, so it is safe in dependency arrays.
 */
export function useNotesSession() {
  const mediaWorker = useMemo(() => createMediaWorkerClient(), []);

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
  // Mirrors the open note for work that runs from a queue: by the time a queued operation
  // starts, the note that was open when it was asked for may not be the open one any more.
  const activeDocumentIdRef = useRef<string | null>(null);

  const refs = useMemo(
    () => ({
      activeDocumentIdRef,
      spatialHostRef,
      linearSaveTimeoutRef,
      spatialSaveTimeoutRef,
      latestSpatialSnapshotRef,
      latestLinearContentRef,
      pendingLinearEditAtRef,
      latestSpatialSceneVersionRef,
      pendingSpatialSceneVersionRef,
      activeObjectUrlsRef,
      loadRequestRef,
    }),
    [
      activeDocumentIdRef,
      spatialHostRef,
      linearSaveTimeoutRef,
      spatialSaveTimeoutRef,
      latestSpatialSnapshotRef,
      latestLinearContentRef,
      pendingLinearEditAtRef,
      latestSpatialSceneVersionRef,
      pendingSpatialSceneVersionRef,
      activeObjectUrlsRef,
      loadRequestRef,
    ],
  );

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1;

      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current);
        linearSaveTimeoutRef.current = null;
      }

      if (spatialSaveTimeoutRef.current) {
        window.clearTimeout(spatialSaveTimeoutRef.current);
        spatialSaveTimeoutRef.current = null;
      }

      pendingLinearEditAtRef.current = null;
      pendingSpatialSceneVersionRef.current = null;

      mediaWorker.dispose();
      revokeObjectUrls(activeObjectUrlsRef.current);
      activeObjectUrlsRef.current = [];
    };
  }, [
    activeObjectUrlsRef,
    linearSaveTimeoutRef,
    loadRequestRef,
    mediaWorker,
    pendingLinearEditAtRef,
    pendingSpatialSceneVersionRef,
    spatialSaveTimeoutRef,
  ]);

  return { mediaWorker, refs };
}

export type NotesSession = ReturnType<typeof useNotesSession>;
export type NotesSessionRefs = NotesSession["refs"];
