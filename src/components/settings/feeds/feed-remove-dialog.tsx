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
import type { Feed } from "@/lib/feeds/feed-model";

type FeedRemoveDialogProps = {
  feed: Feed | null;
  onClose: () => void;
  onConfirm: (feed: Feed, removeTasks: boolean) => void;
};

/**
 * Removing a feed asks what becomes of its tasks, because both answers are right for
 * someone: a finished term's deadlines are history worth keeping, a mistaken subscription's
 * are clutter.
 */
export function FeedRemoveDialog({ feed, onClose, onConfirm }: FeedRemoveDialogProps) {
  return (
    <Dialog
      open={feed !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {feed?.settings.name}?</DialogTitle>
          <DialogDescription>
            It will stop updating. The tasks it brought in can go with it, or stay as ordinary
            tasks.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-wrap">
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button variant="outline" onClick={() => feed && onConfirm(feed, false)}>
            Keep its tasks
          </Button>
          <Button variant="destructive" onClick={() => feed && onConfirm(feed, true)}>
            Remove its tasks too
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
