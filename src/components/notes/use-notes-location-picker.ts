import { useMemo, useState } from "react";

import {
  formatSelectionSummary,
  LOCATION_SEGMENTS,
  type LocationSegment,
  resolveCascade,
  segmentLabels,
  type SegmentModalState,
  type SegmentOption,
  segmentOptions,
  type WorkspaceSelection,
} from "@/components/notes/location-hierarchy";
import type { NotesDirectoryEntry, NotesDocumentMode, NotesMode } from "@/components/notes/types";
import { createBranch, createFlight, createNest, createWing } from "@/lib/entity-storage";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

export type NoteDraftPlacement = {
  branchId: string | null;
  nestIds: string[];
  feather: string;
};

type UseNotesLocationPickerOptions = {
  mode: NotesMode;
  snapshot: WorkspaceSnapshot;
  refreshSnapshot: () => Promise<WorkspaceSnapshot>;
  directoryEntries: NotesDirectoryEntry[];
  activeDocumentId: string | null;
  activeSelection: WorkspaceSelection;
  createNoteAt: (placement: NoteDraftPlacement, preferredMode?: NotesDocumentMode) => Promise<void>;
  openDocumentById: (documentId: string) => Promise<void>;
};

/**
 * The Wing/Flight/Branch/Nest/Note picker. It works in entity ids and reads the names off
 * the snapshot, which is what lets any of those levels be renamed underneath it.
 */
export function useNotesLocationPicker({
  mode,
  snapshot,
  refreshSnapshot,
  directoryEntries,
  activeDocumentId,
  activeSelection,
  createNoteAt,
  openDocumentById,
}: UseNotesLocationPickerOptions) {
  const [draftSelection, setDraftSelection] = useState<WorkspaceSelection>(activeSelection);
  const [syncedSelection, setSyncedSelection] = useState(activeSelection);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newNoteMode, setNewNoteMode] = useState<NotesDocumentMode>(mode);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [segmentModalState, setSegmentModalState] = useState<SegmentModalState | null>(null);
  const [segmentDraftValue, setSegmentDraftValue] = useState("");

  // Whenever the active note changes, the draft path restarts from it.
  if (syncedSelection !== activeSelection) {
    setSyncedSelection(activeSelection);
    setDraftSelection(activeSelection);
  }

  const options = useMemo<Record<LocationSegment, SegmentOption[]>>(
    () => segmentOptions(snapshot, directoryEntries, draftSelection),
    [snapshot, directoryEntries, draftSelection],
  );

  const labels = useMemo<Record<LocationSegment, string>>(
    () => segmentLabels(snapshot, directoryEntries, draftSelection),
    [snapshot, directoryEntries, draftSelection],
  );

  const selectedLocationSummary = formatSelectionSummary(
    snapshot,
    directoryEntries,
    draftSelection,
  );

  const openCreateModal = (title: string) => {
    setNewNoteTitle(title);
    setNewNoteMode(mode);
    setIsCreateModalOpen(true);
  };

  const handleCreateNote = async () => {
    const feather = newNoteTitle.trim().replace(/\s+/g, " ");

    if (!feather.length) {
      return;
    }

    setIsCreatingNote(true);

    try {
      await createNoteAt(
        {
          branchId: draftSelection.branchId,
          nestIds: draftSelection.nestId ? [draftSelection.nestId] : [],
          feather,
        },
        newNoteMode,
      );
      setIsCreateModalOpen(false);
    } finally {
      setIsCreatingNote(false);
    }
  };

  /** Picking a note opens it; picking anything above it just moves the draft path. */
  const selectSegmentValue = (segment: LocationSegment, id: string | null) => {
    const next = resolveCascade(snapshot, directoryEntries, draftSelection, segment, id);
    setDraftSelection(next);

    if (segment === "feather" && id && id !== activeDocumentId) {
      void openDocumentById(id);
    }
  };

  const openSegmentModal = (segment: LocationSegment, label: string) => {
    setSegmentDraftValue("");
    setSegmentModalState({ segment, label });
  };

  const closeSegmentModal = () => {
    setSegmentModalState(null);
    setSegmentDraftValue("");
  };

  /**
   * Adding a level writes a real record, then selects it. A note is the exception: it is
   * named here but created by the dialog that follows, which also picks its mode.
   */
  const handleCreateSegment = async () => {
    if (!segmentModalState) {
      return;
    }

    const name = segmentDraftValue.trim().replace(/\s+/g, " ");

    if (!name.length) {
      return;
    }

    const { segment } = segmentModalState;
    closeSegmentModal();

    if (segment === "feather") {
      openCreateModal(name);
      return;
    }

    const created = await createSegmentEntity(segment, name, draftSelection);

    if (!created) {
      return;
    }

    const nextSnapshot = await refreshSnapshot();
    setDraftSelection(
      resolveCascade(nextSnapshot, directoryEntries, draftSelection, segment, created),
    );
  };

  return {
    draftSelection,
    segmentOptions: options,
    segmentLabels: labels,
    selectedLocationSummary,
    selectSegmentValue,
    createNote: {
      isOpen: isCreateModalOpen,
      setIsOpen: setIsCreateModalOpen,
      mode: newNoteMode,
      setMode: setNewNoteMode,
      title: newNoteTitle,
      setTitle: setNewNoteTitle,
      isCreating: isCreatingNote,
      submit: handleCreateNote,
    },
    segmentModal: {
      state: segmentModalState,
      draftValue: segmentDraftValue,
      setDraftValue: setSegmentDraftValue,
      open: openSegmentModal,
      close: closeSegmentModal,
      submit: handleCreateSegment,
    },
  };
}

/** Returns the new record's id, or null when the level above it has not been chosen yet. */
async function createSegmentEntity(
  segment: Exclude<LocationSegment, "feather">,
  name: string,
  selection: WorkspaceSelection,
): Promise<string | null> {
  if (segment === "wing") {
    return (await createWing(name)).id;
  }

  if (segment === "flight") {
    return selection.wingId ? (await createFlight({ wingId: selection.wingId, name })).id : null;
  }

  if (segment === "branch") {
    return selection.flightId
      ? (await createBranch({ flightId: selection.flightId, name })).id
      : null;
  }

  return selection.branchId ? (await createNest({ branchId: selection.branchId, name })).id : null;
}

export { LOCATION_SEGMENTS };

export type NotesLocationPicker = ReturnType<typeof useNotesLocationPicker>;
