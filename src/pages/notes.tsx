import { useEffect, useMemo, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { LinearNotesEditor } from "@/components/notes/linear-notes-editor";
import { SpatialNotesEditor } from "@/components/notes/spatial-notes-editor";
import { useNotesWorkspace } from "@/components/notes/use-notes-workspace";
import type {
  NotesDocumentMode,
  NotesDirectoryEntry,
  NotesHierarchyLocation,
} from "@/components/notes/types";

import "@excalidraw/excalidraw/index.css";
import "./notes.css";

function buildSegmentOptions(values: string[], activeValue: string) {
  const nextValues = new Set(values.filter((value) => value.trim().length > 0));

  if (activeValue.trim().length > 0) {
    nextValues.add(activeValue);
  }

  return Array.from(nextValues).sort((left, right) => left.localeCompare(right));
}

function getEntryForLocation(
  entries: NotesDirectoryEntry[],
  location: NotesHierarchyLocation,
) {
  return (
    entries.find(
      (entry) =>
        entry.wing === location.wing &&
        entry.flight === location.flight &&
        entry.branch === location.branch &&
        entry.nest === location.nest &&
        entry.feather === location.feather,
    ) ?? null
  );
}

type LocationSegment = keyof NotesHierarchyLocation;
type SegmentModalState = {
  segment: LocationSegment;
  label: string;
};

const locationSegments: LocationSegment[] = [
  "wing",
  "flight",
  "branch",
  "nest",
  "feather",
];

function listSegmentOptions(
  entries: NotesDirectoryEntry[],
  location: NotesHierarchyLocation,
  segment: LocationSegment,
) {
  const segmentValues = entries
    .filter((entry) => {
      if (segment === "wing") {
        return true;
      }

      if (segment === "flight") {
        return entry.wing === location.wing;
      }

      if (segment === "branch") {
        return entry.wing === location.wing && entry.flight === location.flight;
      }

      if (segment === "nest") {
        return (
          entry.wing === location.wing &&
          entry.flight === location.flight &&
          entry.branch === location.branch
        );
      }

      return (
        entry.wing === location.wing &&
        entry.flight === location.flight &&
        entry.branch === location.branch &&
        entry.nest === location.nest
      );
    })
    .map((entry) => entry[segment]);

  const uniqueValues = new Set(
    segmentValues.filter((value) => value.trim().length > 0),
  );

  return Array.from(uniqueValues).sort((left, right) => left.localeCompare(right));
}

function resolveCascadingLocation(
  entries: NotesDirectoryEntry[],
  current: NotesHierarchyLocation,
  segment: LocationSegment,
  nextValue: string,
) {
  const nextLocation = {
    ...current,
    [segment]: nextValue,
  };

  const changedSegmentIndex = locationSegments.indexOf(segment);

  for (let segmentIndex = changedSegmentIndex + 1; segmentIndex < locationSegments.length; segmentIndex += 1) {
    const childSegment = locationSegments[segmentIndex];
    const childOptions = listSegmentOptions(entries, nextLocation, childSegment);

    if (!childOptions.length) {
      continue;
    }

    if (!childOptions.includes(nextLocation[childSegment])) {
      nextLocation[childSegment] = childOptions[0];
    }
  }

  return nextLocation;
}

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
    spatialInitialData,
    spatialHostRef,
    createOrOpenDocumentAtLocation,
    openDocumentById,
    saveActiveDocumentNow,
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

  const wingOptions = useMemo(() => {
    return buildSegmentOptions(
      listSegmentOptions(directoryEntries, draftLocation, "wing"),
      draftLocation.wing,
    );
  }, [directoryEntries, draftLocation]);

  const flightOptions = useMemo(() => {
    return buildSegmentOptions(
      listSegmentOptions(directoryEntries, draftLocation, "flight"),
      draftLocation.flight,
    );
  }, [directoryEntries, draftLocation]);

  const branchOptions = useMemo(() => {
    return buildSegmentOptions(
      listSegmentOptions(directoryEntries, draftLocation, "branch"),
      draftLocation.branch,
    );
  }, [directoryEntries, draftLocation]);

  const nestOptions = useMemo(() => {
    return buildSegmentOptions(
      listSegmentOptions(directoryEntries, draftLocation, "nest"),
      draftLocation.nest,
    );
  }, [directoryEntries, draftLocation]);

  const featherOptions = useMemo(() => {
    return buildSegmentOptions(
      listSegmentOptions(directoryEntries, draftLocation, "feather"),
      draftLocation.feather,
    );
  }, [directoryEntries, draftLocation]);

  const selectedEntry = useMemo(() => {
    return getEntryForLocation(directoryEntries, draftLocation);
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
    setDraftLocation((current) => {
      return resolveCascadingLocation(directoryEntries, current, segment, value);
    });
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

  const isSelectionActive = Boolean(selectedEntry && selectedEntry.id === activeDocumentId);

  const primaryActionLabel = selectedEntry
    ? isSelectionActive
      ? "Selected Note Open"
      : "Open Selected Note"
    : "Create Note";

  const handlePrimarySelectionAction = () => {
    if (selectedEntry) {
      if (!isSelectionActive) {
        void openDocumentById(selectedEntry.id);
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
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {draftLocation.wing}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Current Wing</DropdownMenuLabel>
                  {wingOptions.map((wing) => (
                    <DropdownMenuItem
                      key={wing}
                      onClick={() => {
                        applySegmentUpdate("wing", wing);
                      }}
                    >
                      {wing}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openSegmentModal("wing", "Wing", draftLocation.wing);
                    }}
                  >
                    Add Wing...
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {draftLocation.flight}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Current Flight</DropdownMenuLabel>
                  {flightOptions.map((flight) => (
                    <DropdownMenuItem
                      key={flight}
                      onClick={() => {
                        applySegmentUpdate("flight", flight);
                      }}
                    >
                      {flight}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openSegmentModal("flight", "Flight", draftLocation.flight);
                    }}
                  >
                    Add Flight...
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {draftLocation.branch}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Current Branch</DropdownMenuLabel>
                  {branchOptions.map((branch) => (
                    <DropdownMenuItem
                      key={branch}
                      onClick={() => {
                        applySegmentUpdate("branch", branch);
                      }}
                    >
                      {branch}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openSegmentModal("branch", "Branch", draftLocation.branch);
                    }}
                  >
                    Add Branch...
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {draftLocation.nest}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Current Unit</DropdownMenuLabel>
                  {nestOptions.map((nest) => (
                    <DropdownMenuItem
                      key={nest}
                      onClick={() => {
                        applySegmentUpdate("nest", nest);
                      }}
                    >
                      {nest}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openSegmentModal("nest", "Unit", draftLocation.nest);
                    }}
                  >
                    Add Unit...
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {draftLocation.feather}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Current Note</DropdownMenuLabel>
                  {featherOptions.map((feather) => (
                    <DropdownMenuItem
                      key={feather}
                      onClick={() => {
                        applySegmentUpdate("feather", feather);
                      }}
                    >
                      {feather}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openSegmentModal("feather", "Note", draftLocation.feather);
                    }}
                  >
                    Add Note...
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={handlePrimarySelectionAction}
              disabled={!isStorageReady || isHydratingDocument || isCreatingNote || isSelectionActive}
            >
              {primaryActionLabel}
            </Button>

            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Note</DialogTitle>
                  <DialogDescription>
                    Pick the note type. The editor will switch to the selected mode
                    as soon as the note opens.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 px-5 py-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Selected Path
                    </p>
                    <p className="mt-1 rounded-md border bg-muted/40 px-2 py-1 text-sm">
                      {selectedLocationSummary}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Note Type
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant={newNoteMode === "linear" ? "default" : "outline"}
                        onClick={() => {
                          setNewNoteMode("linear");
                        }}
                        aria-pressed={newNoteMode === "linear"}
                      >
                        Linear Note
                      </Button>
                      <Button
                        variant={newNoteMode === "spatial" ? "default" : "outline"}
                        onClick={() => {
                          setNewNoteMode("spatial");
                        }}
                        aria-pressed={newNoteMode === "spatial"}
                      >
                        Spatial Note
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" />}
                    disabled={isCreatingNote}
                  >
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={() => {
                      void handleCreateNote();
                    }}
                    disabled={!isStorageReady || isHydratingDocument || isCreatingNote}
                  >
                    {isCreatingNote ? "Creating..." : "Create and Open Note"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

              <Dialog
                open={Boolean(segmentModalState)}
                onOpenChange={(isOpen) => {
                  if (!isOpen) {
                    closeSegmentModal();
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Add {segmentModalState?.label ?? "Value"}
                    </DialogTitle>
                    <DialogDescription>
                      Enter a value to use in this part of your note hierarchy.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="px-5 py-4">
                    <Input
                      autoFocus
                      value={segmentDraftValue}
                      onChange={(event) => {
                        setSegmentDraftValue(event.currentTarget.value);
                      }}
                      placeholder={`Enter ${(
                        segmentModalState?.label ?? "value"
                      ).toLowerCase()}`}
                    />
                  </div>

                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Cancel
                    </DialogClose>
                    <Button
                      onClick={handleCreateSegment}
                      disabled={!segmentDraftValue.trim().length}
                    >
                      Add {segmentModalState?.label ?? "Value"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            <Button
              variant="outline"
              onClick={() => {
                void saveActiveDocumentNow();
              }}
              disabled={!isStorageReady || isHydratingDocument}
            >
              Save Active Note
            </Button>

            <p className="w-full text-xs text-muted-foreground">
              {selectedEntry
                ? isSelectionActive
                  ? "This note is already open."
                  : "This path already exists. Opening will switch to that saved note."
                : "No saved note exists at this path yet. Create one to start editing."}
            </p>
          </CardContent>
        </Card>

        

        <div className="notes-main-editor">
          {mode === "linear" ? (
            <LinearNotesEditor value={linearContent} onChange={setLinearContent} />
          ) : (
            <SpatialNotesEditor
              key={activeDocumentId ?? "notes-empty"}
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
