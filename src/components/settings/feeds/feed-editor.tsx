import type { BranchOption } from "@/components/settings/feeds/feed-form";
import { FeedOptionsFields } from "@/components/settings/feeds/feed-options-fields";
import { FeedPreviewPanel } from "@/components/settings/feeds/feed-preview-panel";
import { FeedRulesField } from "@/components/settings/feeds/feed-rules-field";
import { FeedSourceFields } from "@/components/settings/feeds/feed-source-fields";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { useFeedPreview } from "@/components/settings/feeds/use-feed-preview";
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
import { focusNextFieldOnEnter } from "@/lib/utils";

type FeedEditorProps = {
  editor: ReturnType<typeof useFeedEditor>;
  branchOptions: BranchOption[];
};

/** Adding or editing one calendar feed: where it comes from, where it goes, and its rules. */
export function FeedEditor({ editor, branchOptions }: FeedEditorProps) {
  const { form, source } = editor;
  const preview = useFeedPreview(source, form.control);

  return (
    <Dialog
      open={editor.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          editor.close();
        }
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,50rem)] flex-col">
        <DialogHeader>
          <DialogTitle>{editor.feed ? "Edit calendar" : "Add a calendar"}</DialogTitle>
          <DialogDescription>
            Rules run top to bottom on every refresh. Patterns are regular expressions; the preview
            updates as you type.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            void form.handleSubmit(editor.submit)(event);
          }}
          onKeyDown={(event) => focusNextFieldOnEnter(event.nativeEvent, event.currentTarget)}
        >
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-5 py-4">
            <FeedSourceFields
              form={form}
              source={source}
              onLoadUrl={(url) => void editor.loadUrl(url)}
              onLoadFile={(file) => void editor.loadFile(file)}
            />
            <FeedOptionsFields form={form} branchOptions={branchOptions} />
            <FeedRulesField form={form} branchOptions={branchOptions} />
            <FeedPreviewPanel preview={preview} branchOptions={branchOptions} />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {editor.feed ? "Save" : "Add calendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
