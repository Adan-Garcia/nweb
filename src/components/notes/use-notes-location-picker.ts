import { useMemo, useState } from "react";

import {
  buildSegmentOptions,
  getEntryForLocation,
  listSegmentOptions,
  resolveCascadingLocation,
  type LocationSegment,
  type SegmentModalState,
} from "@/components/notes/location-hierarchy";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
  NotesMode,
} from "@/components/notes/types";

const SEGMENTS: LocationSegment[] = [
  "wing",
  "flight",
  "branch",
  "nest",
  "feather",
];

type UseNotesLocationPickerOptions = {
  mode: NotesMode;
  directoryEntries: NotesDirectoryEntry[];
  activeDocumentId: string | null;
  activeLocation: NotesHierarchyLocation;
  createOrOpenDocumentAtLocation: (
    location: NotesHierarchyLocation,
    preferredMode?: NotesDocumentMode,
  ) => Promise<void>;
  openDocumentById: (documentId: string) => Promise<void>;
};

/**
 * The Wing/Flight/Branch/Nest/Note picker: the draft path, the options for
 * each level, and the "new note" / "new segment" dialogs.
 */
export function useNotesLocationPicker({
  mode,
  directoryEntries,
  activeDocumentId,
  activeLocation,
  createOrOpenDocumentAtLocation,
  openDocumentById,
}: UseNotesLocationPickerOptions) {
  const [draftLocation, setDraftLocation] =
    useState<NotesHierarchyLocation>(activeLocation);
  const [syncedLocation, setSyncedLocation] = useState(activeLocation);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newNoteMode, setNewNoteMode] = useState<NotesDocumentMode>(mode);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [segmentModalState, setSegmentModalState] =
    useState<SegmentModalState | null>(null);
  const [segmentDraftValue, setSegmentDraftValue] = useState("");

  // Whenever the active note changes, the draft path restarts from it.
  if (syncedLocation !== activeLocation) {
    setSyncedLocation(activeLocation);
    setDraftLocation(activeLocation);
  }

  const segmentOptions = useMemo<Record<LocationSegment, string[]>>(() => {
    const optionsFor = (segment: LocationSegment) =>
      buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, segment),
        draftLocation[segment],
      );

    return {
      wing: optionsFor("wing"),
      flight: optionsFor("flight"),
      branch: optionsFor("branch"),
      nest: optionsFor("nest"),
      feather: optionsFor("feather"),
    };
  }, [directoryEntries, draftLocation]);

  const selectedLocationSummary = SEGMENTS.map(
    (segment) => draftLocation[segment],
  ).join(" / ");

  const openCreateModal = () => {
    setNewNoteMode(mode);
    setIsCreateModalOpen(true);
  };

  const handleCreateNote = async () => {
    setIsCreatingNote(true);

    try {
      await createOrOpenDocumentAtLocation(draftLocation, newNoteMode);
      setIsCreateModalOpen(false);
    } finally {
      setIsCreatingNote(false);
    }
  };

  /** Adopts `nextLocation`; a chosen note opens if it exists, else offers to create it. */
  const settleLocation = (
    segment: LocationSegment,
    nextLocation: NotesHierarchyLocation,
  ) => {
    setDraftLocation(nextLocation);

    if (segment !== "feather") {
      return;
    }

    const existingEntry = getEntryForLocation(directoryEntries, nextLocation);

    if (existingEntry) {
      if (existingEntry.id !== activeDocumentId) {
        void openDocumentById(existingEntry.id);
      }

      return;
    }

    openCreateModal();
  };

  const selectSegmentValue = (segment: LocationSegment, value: string) => {
    settleLocation(
      segment,
      resolveCascadingLocation(directoryEntries, draftLocation, segment, value),
    );
  };

  const openSegmentModal = (segment: LocationSegment, label: string) => {
    setSegmentDraftValue(draftLocation[segment]);
    setSegmentModalState({ segment, label });
  };

  const closeSegmentModal = () => {
    setSegmentModalState(null);
    setSegmentDraftValue("");
  };

  const handleCreateSegment = () => {
    if (!segmentModalState) {
      return;
    }

    const sanitized = segmentDraftValue.trim().replace(/\s+/g, " ");

    if (!sanitized.length) {
      return;
    }

    const { segment } = segmentModalState;
    closeSegmentModal();
    selectSegmentValue(segment, sanitized);
  };

  return {
    draftLocation,
    segmentOptions,
    selectedLocationSummary,
    selectSegmentValue,
    createNote: {
      isOpen: isCreateModalOpen,
      setIsOpen: setIsCreateModalOpen,
      mode: newNoteMode,
      setMode: setNewNoteMode,
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

export type NotesLocationPicker = ReturnType<typeof useNotesLocationPicker>;
