import { refreshDueFeeds } from "./feed-refresh";

export type FeedScheduler = { stop: () => void };

/**
 * Checks for feeds due a refresh while the workspace is open: once straight away, then on a
 * timer, and when the tab comes back to the front.
 *
 * A chained timeout rather than an interval, for the reason the sync loop is one: a slow
 * feed must not have a second sweep started behind it. Nothing runs while the tab is
 * hidden; coming back to it is the moment being current matters, and it triggers a check.
 * A sweep that fails is dropped — each feed records its own error, and the next tick tries
 * again — so a bad feed never stops the loop.
 */
export function startFeedRefresh({
  everyMs = 5 * 60_000,
}: { everyMs?: number } = {}): FeedScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const isVisible = () => document.visibilityState !== "hidden";

  const tick = async () => {
    if (!stopped && isVisible()) {
      await refreshDueFeeds().catch(() => 0);
    }

    if (!stopped) {
      timer = setTimeout(() => void tick(), everyMs);
    }
  };

  const onWake = () => {
    if (isVisible()) {
      void refreshDueFeeds().catch(() => 0);
    }
  };

  void tick();
  document.addEventListener("visibilitychange", onWake);

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      document.removeEventListener("visibilitychange", onWake);
    },
  };
}
