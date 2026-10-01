import { NotesCreateNoteDialog } from "@/components/notes/location/create-note-dialog";
import { NotesCreateSegmentDialog } from "@/components/notes/location/create-segment-dialog";
import { NotesDeleteNoteControl } from "@/components/notes/location/delete-note-control";
import { NotesLocationSegmentDropdown } from "@/components/notes/location/location-segment-dropdown";
import { NotesNavigationToggle } from "@/components/notes/location/notes-navigation-toggle";
import { SEGMENT_CONFIGS } from "@/components/notes/location/notes-segment-config";
import type { NotesLocationPicker } from "@/components/notes/location/use-notes-location-picker";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import type { NotesNavigationMode } from "@/lib/notes/notes-navigation";

type NotesLocationBarProps = {
  picker: NotesLocationPicker;
  snapshot: WorkspaceSnapshot;
  autoSaveLabel: string;
  activeEntry: NotesDirectoryEntry | null;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
  navigationMode: NotesNavigationMode;
  onChooseNavigation: (mode: NotesNavigationMode) => void;
  onDeleteDocument: (documentId: string) => void;
};

/** The path picker across the top of the notes page, plus its dialogs. */
export function NotesLocationBar({
  picker,
  snapshot,
  autoSaveLabel,
  activeEntry,
  isStorageReady,
  isHydratingDocument,
  navigationMode,
  onChooseNavigation,
  onDeleteDocument,
}: NotesLocationBarProps) {
  const { createNote, segmentModal } = picker;

  return (
    <div
      role="toolbar"
      aria-label="Note location"
      className="mb-4 flex flex-row flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
    >
      {SEGMENT_CONFIGS.map((config) => (
        <NotesLocationSegmentDropdown
          prepend={config.prepend}
          key={config.segment}
          triggerLabel={picker.segmentLabels[config.segment]}
          currentLabel={config.currentLabel}
          addLabel={config.label}
          options={picker.segmentOptions[config.segment]}
          append={config.append}
          onSelect={(id) => {
            picker.selectSegmentValue(config.segment, id);
          }}
          onAdd={() => {
            segmentModal.open(config.segment, config.label);
          }}
        />
      ))}

      <NotesNavigationToggle navigationMode={navigationMode} onChoose={onChooseNavigation} />

      {picker.notice ? (
        <p role="status" className="text-caption text-muted-foreground">
          {picker.notice}
        </p>
      ) : null}

      <p className="ml-auto text-caption text-muted-foreground">{autoSaveLabel}</p>

      <NotesDeleteNoteControl
        snapshot={snapshot}
        activeEntry={activeEntry}
        isDisabled={!isStorageReady || isHydratingDocument}
        onDelete={onDeleteDocument}
      />

      <NotesCreateNoteDialog
        isOpen={createNote.isOpen}
        onOpenChange={createNote.setIsOpen}
        selectedLocationSummary={picker.selectedLocationSummary}
        title={createNote.title}
        onTitleChange={createNote.setTitle}
        newNoteMode={createNote.mode}
        onModeChange={createNote.setMode}
        newNoteLayout={createNote.layout}
        onLayoutChange={createNote.setLayout}
        onCreate={() => {
          void createNote.submit();
        }}
        isCreatingNote={createNote.isCreating}
        isStorageReady={isStorageReady}
        isHydratingDocument={isHydratingDocument}
      />

      <NotesCreateSegmentDialog
        segmentModalState={segmentModal.state}
        segmentDraftValue={segmentModal.draftValue}
        onSegmentDraftValueChange={segmentModal.setDraftValue}
        onCreateSegment={() => {
          void segmentModal.submit();
        }}
        onClose={segmentModal.close}
      />
    </div>
  );
}
