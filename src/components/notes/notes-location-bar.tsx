import { NotesCreateNoteDialog } from "@/components/notes/create-note-dialog";
import { NotesCreateSegmentDialog } from "@/components/notes/create-segment-dialog";
import { NotesDeleteNoteControl } from "@/components/notes/delete-note-control";
import { NotesLocationSegmentDropdown } from "@/components/notes/location-segment-dropdown";
import { NotesNavigationToggle } from "@/components/notes/notes-navigation-toggle";
import { SEGMENT_CONFIGS } from "@/components/notes/notes-segment-config";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import type { NotesLocationPicker } from "@/components/notes/use-notes-location-picker";
import { Card, CardContent } from "@/components/ui/card";
import type { NotesNavigationMode } from "@/lib/notes-navigation";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

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
    <Card className="mb-4">
      <CardContent className="flex flex-row flex-wrap items-center justify-start gap-2">
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

        <p className="text-xs text-muted-foreground">{autoSaveLabel}</p>

        {picker.notice ? (
          <p role="status" className="m-0 text-xs text-muted-foreground">
            {picker.notice}
          </p>
        ) : null}

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
      </CardContent>
    </Card>
  );
}
