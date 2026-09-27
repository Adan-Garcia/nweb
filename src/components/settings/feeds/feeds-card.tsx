import { useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { FeedRemoveDialog } from "@/components/settings/feeds/feed-remove-dialog";
import { FeedRow } from "@/components/settings/feeds/feed-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Feed } from "@/lib/feeds/feed-model";

type FeedsCardProps = {
  feeds: Feed[];
  isLoading: boolean;
  busyFeedId: string | null;
  onAdd: () => void;
  onEdit: (feed: Feed) => void;
  onRefresh: (feed: Feed) => void;
  onRemove: (feed: Feed, removeTasks: boolean) => void;
};

/** The calendars this device brings tasks in from, and a way to add another. */
export function FeedsCard({
  feeds,
  isLoading,
  busyFeedId,
  onAdd,
  onEdit,
  onRefresh,
  onRemove,
}: FeedsCardProps) {
  const [removing, setRemoving] = useState<Feed | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar feeds</CardTitle>
        <CardDescription>
          Subscribe to a calendar link (.ics or webcal) from myCourses, Canvas, Google or Outlook,
          or import a file. Its events become tasks, filtered and renamed by rules you set.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {isLoading ? (
          <p className="m-0 text-sm text-muted-foreground">Loading calendars…</p>
        ) : feeds.length ? (
          <>
            <ul className="m-0 grid list-none gap-3 p-0">
              {feeds.map((feed) => (
                <FeedRow
                  key={feed.id}
                  feed={feed}
                  isBusy={busyFeedId === feed.id}
                  onEdit={() => onEdit(feed)}
                  onRefresh={() => onRefresh(feed)}
                  onRemove={() => setRemoving(feed)}
                />
              ))}
            </ul>
            <div>
              <Button type="button" size="sm" variant="outline" onClick={onAdd}>
                <Plus className="size-4" aria-hidden="true" />
                Add a calendar
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon={CalendarPlus}
            title="No calendars yet"
            description="Paste the calendar link your school gives you, and its deadlines land on your calendar and board."
            action={
              <Button type="button" size="sm" onClick={onAdd}>
                Add a calendar
              </Button>
            }
          />
        )}

        <p className="m-0 text-caption text-muted-foreground">
          Feeds stay on this device and their links are sealed with your workspace. The tasks they
          bring in sync like any other. A host that blocks browsers is fetched through your sync
          server, which passes the calendar along and keeps nothing.
        </p>
      </CardContent>

      <FeedRemoveDialog
        feed={removing}
        onClose={() => setRemoving(null)}
        onConfirm={(feed, removeTasks) => {
          setRemoving(null);
          onRemove(feed, removeTasks);
        }}
      />
    </Card>
  );
}
