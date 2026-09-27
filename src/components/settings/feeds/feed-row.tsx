import { formatDistanceToNow } from "date-fns";
import { CalendarSync, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Feed, FEED_ERROR_MESSAGES } from "@/lib/feeds/feed-model";

type FeedRowProps = {
  feed: Feed;
  isBusy: boolean;
  onEdit: () => void;
  onRefresh: () => void;
  onRemove: () => void;
};

/** Where a feed comes from, shown by host alone: the rest of the link is the secret part. */
function sourceLabel(feed: Feed): string {
  if (!feed.settings.url) {
    return "Imported from a file";
  }

  return `From ${new URL(feed.settings.url).hostname}`;
}

function statusLabel(feed: Feed): string {
  if (feed.lastFetchedAt === null) {
    return "Not refreshed yet.";
  }

  const when = formatDistanceToNow(feed.lastFetchedAt, { addSuffix: true });
  const count = feed.lastCount === null ? "" : ` · ${feed.lastCount} events`;

  return `Updated ${when}${count}`;
}

export function FeedRow({ feed, isBusy, onEdit, onRefresh, onRemove }: FeedRowProps) {
  const Icon = feed.settings.url ? CalendarSync : FileText;

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-lg border border-border/70 p-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="m-0 truncate font-medium">{feed.settings.name}</p>
        <p className="m-0 text-sm text-muted-foreground">
          {sourceLabel(feed)} · {statusLabel(feed)}
        </p>
        {feed.lastError ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {FEED_ERROR_MESSAGES[feed.lastError]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {feed.settings.url ? (
          <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={onRefresh}>
            {isBusy ? "Refreshing…" : "Refresh"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={onEdit}
          aria-label={`Edit ${feed.settings.name}`}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isBusy}
          onClick={onRemove}
          aria-label={`Remove ${feed.settings.name}`}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}
