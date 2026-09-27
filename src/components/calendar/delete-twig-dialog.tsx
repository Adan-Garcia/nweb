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
import type { Twig } from "@/lib/twigs/twig-model";
import type { SeriesScope } from "@/lib/twigs/twig-series";

type DeleteTwigDialogProps = {
  twig: Twig | null;
  onCancel: () => void;
  onConfirm: (scope: SeriesScope) => void;
};

/**
 * Asks before a task goes. A repeating one asks how much of the series goes with it, with
 * the one occurrence first: skipping a week is the commoner wish than ending the course.
 */
export function DeleteTwigDialog({ twig, onCancel, onConfirm }: DeleteTwigDialogProps) {
  const isSeries = Boolean(twig?.seriesId);

  return (
    <Dialog
      open={twig !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-words pr-8">
            {isSeries ? "Delete repeating event" : "Delete event"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {isSeries
              ? `"${twig?.title}" repeats. Delete just this occurrence, or more of the series?`
              : `"${twig?.title}" will be deleted.`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-wrap">
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          {isSeries ? (
            <>
              <Button variant="outline" onClick={() => onConfirm("all")}>
                All events
              </Button>
              <Button variant="outline" onClick={() => onConfirm("following")}>
                This and following
              </Button>
              <Button variant="destructive" onClick={() => onConfirm("one")}>
                This event
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={() => onConfirm("one")}>
              Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
