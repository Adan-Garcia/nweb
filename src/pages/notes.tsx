import { useEffect, useMemo, useState } from "react";
import { House, Clock, Split, NotebookTabs, NotebookPen } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { NotesCreateNoteDialog } from "@/components/notes/create-note-dialog";
import { NotesCreateSegmentDialog } from "@/components/notes/create-segment-dialog";
import { LinearNotesEditor } from "@/components/notes/linear-notes-editor";
import {
  buildSegmentOptions,
  getEntryForLocation,
  listSegmentOptions,
  resolveCascadingLocation,
  type LocationSegment,
  type SegmentModalState,
} from "@/components/notes/location-hierarchy";
import { NotesLocationSegmentDropdown } from "@/components/notes/location-segment-dropdown";
import { SpatialNotesEditor } from "@/components/notes/spatial-notes-editor";
import { useNotesWorkspace } from "@/components/notes/use-notes-workspace";
import type {
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "@/components/notes/types";

import "@excalidraw/excalidraw/index.css";
import "./notes.css";

type SegmentConfig = {
  prepend?: React.ReactNode;
  segment: LocationSegment;
  label: string;
  currentLabel: string;
  append?: string;
};

const segmentConfigs: SegmentConfig[] = [
  {
    prepend: <House className="w-4 h-4" />,
    segment: "wing",
    label: "Wing",
    currentLabel: "Current Wing",
    append: "/",
  },
  {
    prepend: <Clock className="w-4 h-4" />,
    segment: "flight",
    label: "Flight",
    currentLabel: "Current Flight",
    append: "/",
  },
  {
    prepend: <Split className="w-4 h-4" />,

    segment: "branch",
    label: "Branch",
    currentLabel: "Current Branch",
    append: "/",
  },
  {
    prepend: <NotebookTabs className="w-4 h-4" />,
    segment: "nest",
    label: "Unit",
    currentLabel: "Current Unit",
    append: "/",
  },
  {
    prepend: <NotebookPen className="w-4 h-4" />,
    segment: "feather",
    label: "Note",
    currentLabel: "Current Note",
  },
];

export function NotesPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const {
    mode,
    directoryEntries,
    activeDocumentId,
    activeLocation,
    isHydratingDocument,
    linearContent,
    setLinearContent,
    isStorageReady,
    lastSavedAt,
    spatialInitialData,
    isSpatialEditorReloading,
    spatialEditorReloadKey,
    spatialHostRef,
    createOrOpenDocumentAtLocation,
    openDocumentById,
    handleSpatialChange,
    handleSpatialPaste,
  } = useNotesWorkspace();

  const [draftLocation, setDraftLocation] =
    useState<NotesHierarchyLocation>(activeLocation);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newNoteMode, setNewNoteMode] = useState<NotesDocumentMode>(mode);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [segmentModalState, setSegmentModalState] =
    useState<SegmentModalState | null>(null);
  const [segmentDraftValue, setSegmentDraftValue] = useState("");

  useEffect(() => {
    setDraftLocation(activeLocation);
  }, [activeLocation]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    setNewNoteMode(mode);
  }, [isCreateModalOpen, mode]);

  const segmentOptions = useMemo<Record<LocationSegment, string[]>>(() => {
    return {
      wing: buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, "wing"),
        draftLocation.wing,
      ),
      flight: buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, "flight"),
        draftLocation.flight,
      ),
      branch: buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, "branch"),
        draftLocation.branch,
      ),
      nest: buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, "nest"),
        draftLocation.nest,
      ),
      feather: buildSegmentOptions(
        listSegmentOptions(directoryEntries, draftLocation, "feather"),
        draftLocation.feather,
      ),
    };
  }, [directoryEntries, draftLocation]);

  const selectedLocationSummary = useMemo(() => {
    return [
      draftLocation.wing,
      draftLocation.flight,
      draftLocation.branch,
      draftLocation.nest,
      draftLocation.feather,
    ].join(" / ");
  }, [
    draftLocation.wing,
    draftLocation.flight,
    draftLocation.branch,
    draftLocation.nest,
    draftLocation.feather,
  ]);

  const autoSaveLabel = useMemo(() => {
    if (!isStorageReady || !activeDocumentId) {
      return "Autosave unavailable";
    }

    if (isHydratingDocument) {
      return "Autosave paused while loading";
    }

    if (!lastSavedAt) {
      return "Autosave enabled";
    }

    return `Autosaved at ${new Date(lastSavedAt).toLocaleTimeString()}`;
  }, [activeDocumentId, isHydratingDocument, isStorageReady, lastSavedAt]);

  const handleCreateNote = async () => {
    setIsCreatingNote(true);

    try {
      await createOrOpenDocumentAtLocation(draftLocation, newNoteMode);
      setIsCreateModalOpen(false);
    } finally {
      setIsCreatingNote(false);
    }
  };

  const applySegmentUpdate = (segment: LocationSegment, value: string) => {
    const nextLocation = resolveCascadingLocation(
      directoryEntries,
      draftLocation,
      segment,
      value,
    );

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

    setNewNoteMode(mode);
    setIsCreateModalOpen(true);
  };

  const openSegmentModal = (
    segment: LocationSegment,
    label: string,
    initialValue: string,
  ) => {
    setSegmentDraftValue(initialValue);
    setSegmentModalState({
      segment,
      label,
    });
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

    const nextLocation = resolveCascadingLocation(
      directoryEntries,
      draftLocation,
      segmentModalState.segment,
      sanitized,
    );

    setDraftLocation(nextLocation);
    closeSegmentModal();

    if (segmentModalState.segment !== "feather") {
      return;
    }

    const existingEntry = getEntryForLocation(directoryEntries, nextLocation);

    if (existingEntry) {
      if (existingEntry.id !== activeDocumentId) {
        void openDocumentById(existingEntry.id);
      }

      return;
    }

    setIsCreateModalOpen(true);
  };

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardContent className="flex flex-row flex-wrap items-center justify-start gap-2">
            {segmentConfigs.map((config) => (
              <NotesLocationSegmentDropdown
                prepend={config.prepend}
                key={config.segment}
                triggerLabel={draftLocation[config.segment]}
                currentLabel={config.currentLabel}
                addLabel={config.label}
                options={segmentOptions[config.segment]}
                append={config.append}
                onSelect={(value) => {
                  applySegmentUpdate(config.segment, value);
                }}
                onAdd={() => {
                  openSegmentModal(
                    config.segment,
                    config.label,
                    draftLocation[config.segment],
                  );
                }}
              />
            ))}

            <p className="text-xs text-muted-foreground">{autoSaveLabel}</p>

            <NotesCreateNoteDialog
              isOpen={isCreateModalOpen}
              onOpenChange={(isOpen) => {
                setIsCreateModalOpen(isOpen);
              }}
              selectedLocationSummary={selectedLocationSummary}
              newNoteMode={newNoteMode}
              onModeChange={(nextMode) => {
                setNewNoteMode(nextMode);
              }}
              onCreate={() => {
                void handleCreateNote();
              }}
              isCreatingNote={isCreatingNote}
              isStorageReady={isStorageReady}
              isHydratingDocument={isHydratingDocument}
            />

            <NotesCreateSegmentDialog
              segmentModalState={segmentModalState}
              segmentDraftValue={segmentDraftValue}
              onSegmentDraftValueChange={(value) => {
                setSegmentDraftValue(value);
              }}
              onCreateSegment={handleCreateSegment}
              onClose={closeSegmentModal}
            />
          </CardContent>
        </Card>

        <div className="notes-main-editor">
          {mode === "linear" ? (
            <LinearNotesEditor
              value={linearContent}
              onChange={setLinearContent}
            />
          ) : isSpatialEditorReloading ? (
            <div className="flex min-h-105 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              Reloading spatial note...
            </div>
          ) : (
            <SpatialNotesEditor
              key={`${activeDocumentId ?? "notes-empty"}-${spatialEditorReloadKey}`}
              isDark={isDark}
              hostRef={spatialHostRef}
              initialData={spatialInitialData}
              onChange={handleSpatialChange}
              onPaste={handleSpatialPaste}
            />
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
