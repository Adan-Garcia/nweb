import { useCallback, useEffect, useState } from "react";

import { type BranchOption, feedBranchOptions } from "@/components/settings/feeds/feed-form";
import { isLockedError } from "@/lib/crypto/cipher";
import { type Feed, FEED_ERROR_MESSAGES } from "@/lib/feeds/feed-model";
import { type FeedReport, refreshFeed } from "@/lib/feeds/feed-refresh";
import { deleteFeed, listFeeds } from "@/lib/feeds/feed-storage";
import { removeFeedTwigs } from "@/lib/feeds/feed-twigs";
import { loadWorkspaceSnapshot } from "@/lib/hierarchy/workspace-storage";
import { notifyError, notifySuccess } from "@/lib/toast";

/** "12 new, 3 changed, 1 removed", or that nothing changed. */
export function describeReport({ added, updated, removed }: FeedReport): string {
  const parts = [
    added ? `${added} new` : "",
    updated ? `${updated} changed` : "",
    removed ? `${removed} removed` : "",
  ].filter(Boolean);

  return parts.length ? `${parts.join(", ")}.` : "Nothing had changed.";
}

/** The feeds on this device, and refreshing and removing them. */
export function useCalendarFeeds() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyFeedId, setBusyFeedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextFeeds, snapshot] = await Promise.all([listFeeds(), loadWorkspaceSnapshot()]);

    setFeeds(nextFeeds);
    setBranchOptions(feedBranchOptions(snapshot));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const [nextFeeds, snapshot] = await Promise.all([listFeeds(), loadWorkspaceSnapshot()]);

        if (isMounted) {
          setFeeds(nextFeeds);
          setBranchOptions(feedBranchOptions(snapshot));
        }
      } catch (error) {
        // Locked: the lock screen is already up, and there is nothing to list until it goes.
        if (!isLockedError(error)) {
          throw error;
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  /** Refreshes a feed from its address, or from a file's text when one was chosen. */
  const refresh = useCallback(
    async (feed: Feed, text?: string) => {
      setBusyFeedId(feed.id);

      const outcome = await refreshFeed(feed, text);

      setBusyFeedId(null);

      if (outcome.ok) {
        notifySuccess(`${feed.settings.name} is up to date`, describeReport(outcome.report));
      } else {
        notifyError(`Could not refresh ${feed.settings.name}`, FEED_ERROR_MESSAGES[outcome.error]);
      }

      await reload();
    },
    [reload],
  );

  /** After the editor saves: import what it read, fetch a subscription, or just re-list. */
  const afterSave = useCallback(
    async (feed: Feed, text?: string) => {
      if (feed.settings.url || text !== undefined) {
        await refresh(feed, text);
      } else {
        await reload();
      }
    },
    [refresh, reload],
  );

  const remove = useCallback(
    async (feed: Feed, removeTasks: boolean) => {
      setBusyFeedId(feed.id);

      const removed = removeTasks ? await removeFeedTwigs(feed.id) : 0;

      await deleteFeed(feed.id);
      setBusyFeedId(null);
      notifySuccess(
        `Removed ${feed.settings.name}`,
        removeTasks ? `${removed} tasks removed with it.` : "Its tasks were kept.",
      );
      await reload();
    },
    [reload],
  );

  return { feeds, branchOptions, isLoading, busyFeedId, refresh, afterSave, remove };
}
