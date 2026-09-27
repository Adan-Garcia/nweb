import type { BranchOption } from "@/components/settings/feeds/feed-form";
import type { FeedPreview } from "@/components/settings/feeds/use-feed-preview";
import { formatDueTime } from "@/lib/twigs/due-time";
import { TWIG_KIND_LABELS } from "@/lib/twigs/twig-model";

type FeedPreviewPanelProps = {
  preview: FeedPreview | null;
  branchOptions: BranchOption[];
};

function courseLabel(branchId: string | null, branchName: string | null, options: BranchOption[]) {
  if (branchName) {
    return branchName;
  }

  return options.find((option) => option.id === branchId)?.label ?? "Default course";
}

/** What the rules make of the calendar: how much is kept, and the next few events. */
export function FeedPreviewPanel({ preview, branchOptions }: FeedPreviewPanelProps) {
  return (
    <section aria-label="Preview" className="grid gap-2 rounded-lg bg-muted/40 p-3">
      <h3 className="m-0 text-sm font-medium">Preview</h3>

      {preview === null ? (
        <p className="m-0 text-sm text-muted-foreground">
          Preview the link or choose a file to see what these rules bring in.
        </p>
      ) : (
        <>
          <p className="m-0 text-sm">
            {preview.kept} events kept, {preview.excluded} hidden by rules.
          </p>
          {preview.upcoming.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-sm">
              {preview.upcoming.map((item) => (
                <li key={item.key} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground">
                    {item.dueDate}
                    {item.dueMinutes === null ? "" : ` ${formatDueTime(item.dueMinutes)}`} ·{" "}
                    {TWIG_KIND_LABELS[item.kind]} ·{" "}
                    {courseLabel(item.branchId, item.branchName, branchOptions)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Nothing upcoming.</p>
          )}
        </>
      )}
    </section>
  );
}
