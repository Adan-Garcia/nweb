import { Card, CardContent } from "@/components/ui/card";
import { NotesCreateNoteDialog } from "@/components/notes/create-note-dialog";
import { NotesCreateSegmentDialog } from "@/components/notes/create-segment-dialog";
import { NotesLocationSegmentDropdown } from "@/components/notes/location-segment-dropdown";
import { SEGMENT_CONFIGS } from "@/components/notes/notes-segment-config";
import type { NotesLocationPicker } from "@/components/notes/use-notes-location-picker";

type NotesLocationBarProps = {
  picker: NotesLocationPicker;
  autoSaveLabel: string;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
};

/** The path picker across the top of the notes page, plus its dialogs. */
export function NotesLocationBar({
  picker,
  autoSaveLabel,
  isStorageReady,
  isHydratingDocument,
}: NotesLocationBarProps) {
  const { draftLocation, createNote, segmentModal } = picker;

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-row flex-wrap items-center justify-start gap-2">
        {SEGMENT_CONFIGS.map((config) => (
          <NotesLocationSegmentDropdown
            prepend={config.prepend}
            key={config.segment}
            triggerLabel={draftLocation[config.segment]}
            currentLabel={config.currentLabel}
            addLabel={config.label}
            options={picker.segmentOptions[config.segment]}
            append={config.append}
            onSelect={(value) => {
              picker.selectSegmentValue(config.segment, value);
            }}
            onAdd={() => {
              segmentModal.open(config.segment, config.label);
            }}
          />
        ))}

        <p className="text-xs text-muted-foreground">{autoSaveLabel}</p>

        <NotesCreateNoteDialog
          isOpen={createNote.isOpen}
          onOpenChange={createNote.setIsOpen}
          selectedLocationSummary={picker.selectedLocationSummary}
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
          onCreateSegment={segmentModal.submit}
          onClose={segmentModal.close}
        />
      </CardContent>
    </Card>
  );
}
