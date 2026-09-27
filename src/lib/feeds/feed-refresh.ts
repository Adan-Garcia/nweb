import { isLockedError } from "../crypto/cipher";
import { currentTimeZone } from "../twigs/due-time";
import { resolveFeedBranches } from "./feed-branches";
import { fetchFeedText } from "./feed-fetch";
import { type Feed, type FeedError, type FeedSettings, isFeedDue } from "./feed-model";
import { applyFeedRules, type FeedRulesResult } from "./feed-rules";
import { listFeeds, recordFeedRun } from "./feed-storage";
import { applyFeedItems, type FeedApplyResult } from "./feed-twigs";
import { expandEvents } from "./ics-occurrences";
import { parseIcs } from "./ics-parse";
import { addDays, dateKeyOf } from "./ics-time";

/**
 * Fetching a feed and bringing what it says into the workspace, from end to end.
 *
 * A failure is recorded on the feed as a code and changes nothing else: a calendar that
 * could not be read this time says nothing about which of its events still exist, so no
 * task is removed on the strength of it.
 */
export type FeedReport = FeedApplyResult & { total: number; excluded: number };

export type FeedOutcome = { ok: true; report: FeedReport } | { ok: false; error: FeedError };

/** Repeating events are expanded this far ahead; a year covers any term. */
export const FEED_HORIZON_DAYS = 365;

/** A calendar's events after its rules, as the settings preview and a refresh both see them. */
export function previewFeed(
  text: string,
  settings: Pick<FeedSettings, "kind" | "rules">,
  now = new Date(),
): FeedRulesResult {
  const calendar = parseIcs(text);
  const horizon = addDays(dateKeyOf(now), FEED_HORIZON_DAYS);

  return applyFeedRules(expandEvents(calendar.events, horizon), settings, currentTimeZone());
}

export function feedCutoff(settings: Pick<FeedSettings, "pastDays">, now: Date): string | null {
  return settings.pastDays === null ? null : addDays(dateKeyOf(now), -settings.pastDays);
}

async function importText(feed: Feed, text: string, now: Date): Promise<FeedReport> {
  const { items, excluded } = previewFeed(text, feed.settings, now);
  const cutoff = feedCutoff(feed.settings, now);
  // Only what will be written names a course, or a feed going back years would create one
  // for every class ever taken.
  const current = cutoff === null ? items : items.filter((item) => item.dueDate >= cutoff);
  const branchFor = await resolveFeedBranches(current, feed.settings);
  const applied = await applyFeedItems({
    feedId: feed.id,
    items,
    branchFor,
    cutoff,
    completePast: feed.settings.completePast,
    today: dateKeyOf(now),
    memory: { removedIds: feed.removedIds, dismissedIds: feed.dismissedIds },
  });

  return { ...applied, total: items.length, excluded };
}

/**
 * Refreshes one feed: from its address, or from `text` when a file was chosen instead.
 */
export async function refreshFeed(
  feed: Feed,
  text?: string,
  now = new Date(),
): Promise<FeedOutcome> {
  const fetched =
    text === undefined ? await fetchFeedText(feed.settings.url) : { ok: true as const, text };
  let outcome: FeedOutcome;

  if (!fetched.ok) {
    outcome = fetched;
  } else {
    try {
      outcome = { ok: true, report: await importText(feed, fetched.text, now) };
    } catch (error) {
      outcome = { ok: false, error: isLockedError(error) ? "locked" : "not-calendar" };
    }
  }

  await recordFeedRun(feed.id, {
    lastFetchedAt: now.getTime(),
    lastError: outcome.ok ? null : outcome.error,
    lastCount: outcome.ok ? outcome.report.total : feed.lastCount,
    ...(outcome.ok ? outcome.report.memory : {}),
  });

  return outcome;
}

let running: Promise<number> | null = null;

/**
 * Refreshes every subscription that is due, one at a time, and joins a sweep already
 * running rather than starting a second: two would fetch the same feed and race on its rows.
 * Resolves to how many feeds were refreshed.
 */
export function refreshDueFeeds(now = new Date()): Promise<number> {
  running ??= (async () => {
    const due = (await listFeeds()).filter((feed) => isFeedDue(feed, now.getTime()));

    for (const feed of due) {
      await refreshFeed(feed, undefined, now);
    }

    return due.length;
  })().finally(() => {
    running = null;
  });

  return running;
}
