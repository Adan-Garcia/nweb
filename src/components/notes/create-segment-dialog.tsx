import type { SegmentModalState } from "@/components/notes/location-hierarchy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type NotesCreateSegmentDialogProps = {
  segmentModalState: SegmentModalState | null;
  segmentDraftValue: string;
  onSegmentDraftValueChange: (value: string) => void;
  onCreateSegment: () => void;
  onClose: () => void;
};

export function NotesCreateSegmentDialog({
  segmentModalState,
  segmentDraftValue,
  onSegmentDraftValueChange,
  onCreateSegment,
  onClose,
}: NotesCreateSegmentDialogProps) {
  return (
    <Dialog
      open={Boolean(segmentModalState)}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {segmentModalState?.label ?? "Value"}</DialogTitle>
          <DialogDescription>
            Enter a value to use in this part of your note hierarchy.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <Input
            autoFocus
            value={segmentDraftValue}
            onChange={(event) => {
              onSegmentDraftValueChange(event.currentTarget.value);
            }}
            placeholder={`Enter ${(segmentModalState?.label ?? "value").toLowerCase()}`}
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={onCreateSegment} disabled={!segmentDraftValue.trim().length}>
            Add {segmentModalState?.label ?? "Value"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
