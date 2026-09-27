import { useMemo } from "react";
import { type Control, useWatch } from "react-hook-form";

import type { FeedFormValues } from "@/components/settings/feeds/feed-form";
import type { FeedSource } from "@/components/settings/feeds/use-feed-editor";
import { previewFeed } from "@/lib/feeds/feed-refresh";
import type { FeedItem } from "@/lib/feeds/feed-rules";
import { dateKeyOf } from "@/lib/feeds/ics-time";

export type FeedPreview = { kept: number; excluded: number; upcoming: FeedItem[] };

/** How many upcoming events the preview lists: enough to see a rule work, not a calendar. */
export const PREVIEW_LIMIT = 8;

/**
 * The editor's rules run over the calendar it read, again on every edit, so a pattern can
 * be tried before anything is written. Null until there is a calendar to run them over.
 */
export function useFeedPreview(
  source: FeedSource,
  control: Control<FeedFormValues>,
): FeedPreview | null {
  const kind = useWatch({ control, name: "kind" });
  const rules = useWatch({ control, name: "rules" });

  return useMemo(() => {
    if (source.state !== "ready") {
      return null;
    }

    const { items, excluded } = previewFeed(source.text, { kind, rules });
    const today = dateKeyOf(new Date());
    const upcoming = items
      .filter((item) => item.dueDate >= today)
      .sort(
        (left, right) =>
          left.dueDate.localeCompare(right.dueDate) ||
          (left.dueMinutes ?? -1) - (right.dueMinutes ?? -1),
      )
      .slice(0, PREVIEW_LIMIT);

    return { kept: items.length, excluded, upcoming };
  }, [source, kind, rules]);
}
