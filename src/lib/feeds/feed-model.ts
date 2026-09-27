import { cipherNameSchema } from "@shared/cipher-name";
import { z } from "zod";

import { TWIG_KINDS } from "../twigs/twig-model";

/**
 * A calendar someone has subscribed to, or imported once from a file, and what to do with
 * what is in it.
 *
 * The events a feed brings in become twigs, so the calendar, the board and reminders need
 * nothing new to show them. The feed itself stays on this device: its address is usually
 * a private link that is as good as a password to that calendar, and its rules may name
 * courses, so the whole of it is sealed like a note title is (`feed-storage.ts`).
 */

/** What a rule looks at. `title` is the event's SUMMARY, after any earlier rename. */
export const FEED_RULE_FIELDS = ["title", "description", "location", "categories"] as const;

export type FeedRuleField = (typeof FEED_RULE_FIELDS)[number];

export const FEED_RULE_FIELD_LABELS: Record<FeedRuleField, string> = {
  title: "Title",
  description: "Description",
  location: "Location",
  categories: "Categories",
};

/**
 * Applied in order, top to bottom, so a rename can tidy a field before a later rule reads
 * it. `branch-from` names a course from the match (`$1`), creating it when it is new.
 */
export const FEED_RULE_ACTIONS = [
  "exclude",
  "include",
  "rename",
  "set-kind",
  "set-branch",
  "branch-from",
] as const;

export type FeedRuleAction = (typeof FEED_RULE_ACTIONS)[number];

export const FEED_RULE_ACTION_LABELS: Record<FeedRuleAction, string> = {
  exclude: "Hide events where",
  include: "Only keep events where",
  rename: "Find and replace in",
  "set-kind": "Set the kind when",
  "set-branch": "Put in a course when",
  "branch-from": "Name the course from",
};

export const feedRuleSchema = z.object({
  id: z.string(),
  action: z.enum(FEED_RULE_ACTIONS),
  field: z.enum(FEED_RULE_FIELDS),
  /** A JavaScript regular expression, without slashes. */
  pattern: z.string().max(500),
  caseSensitive: z.boolean().default(false),
  /** `rename` and `branch-from`: the replacement, with `$1`, `$<name>` and `$&`. */
  replacement: z.string().max(500).default(""),
  kind: z.enum(TWIG_KINDS).default("other"),
  branchId: z.string().default(""),
  enabled: z.boolean().default(true),
});

export type FeedRule = z.infer<typeof feedRuleSchema>;

/** How often a subscription is fetched again. Zero is "only when asked". */
export const FEED_REFRESH_MINUTES = [0, 60, 360, 720, 1440] as const;

export const feedSettingsSchema = z.object({
  name: z.string().max(200),
  /** Empty for a calendar imported from a file, which is refreshed by importing it again. */
  url: z.string().max(2048),
  /** Where an event goes when no rule says otherwise; null is the workspace's first course. */
  branchId: z.string().nullable(),
  kind: z.enum(TWIG_KINDS),
  refreshMinutes: z.number().int().min(0),
  /**
   * Events that ended more than this many days ago are not brought in. Null brings in
   * everything, which for a feed going back to 2005 is a thousand finished tasks.
   */
  pastDays: z.number().int().min(0).nullable(),
  /** Events already over when they first arrive start as done, not as overdue. */
  completePast: z.boolean(),
  rules: z.array(feedRuleSchema).max(100),
});

export type FeedSettings = z.infer<typeof feedSettingsSchema>;

/** Why the last refresh failed. Codes, never text from the feed, so nothing sealed leaks. */
export const FEED_ERRORS = [
  "invalid-url",
  "unreachable",
  "blocked",
  "not-calendar",
  "too-large",
  "locked",
] as const;

export type FeedError = (typeof FEED_ERRORS)[number];

export const FEED_ERROR_MESSAGES: Record<FeedError, string> = {
  "invalid-url": "That is not a calendar address. It should start with https:// or webcal://.",
  unreachable: "The calendar could not be reached. Check the address, or try again later.",
  blocked:
    "That calendar's host does not let browsers read it directly. Connect a sync server in Settings and it will be fetched through that instead.",
  "not-calendar": "That address did not return a calendar. It may need you to sign in first.",
  "too-large": "That calendar is larger than this app will import.",
  locked: "The workspace is locked. Unlock it and try again.",
};

/** What the last refresh did, kept in the clear: counts and codes, never event text. */
export const feedRunSchema = z.object({
  lastFetchedAt: z.number().nullable(),
  lastError: z.enum(FEED_ERRORS).nullable(),
  /** Events the feed had that passed the rules on the last successful refresh. */
  lastCount: z.number().int().nonnegative().nullable(),
});

export type FeedRun = z.infer<typeof feedRunSchema>;

/**
 * What a feed remembers about the tasks it made, so it can tell its own removals from
 * yours. `removedIds` are tasks it took away because their event left the feed or a rule
 * hid it; they come back when the event does. `dismissedIds` are tasks someone deleted by
 * hand; they stay gone even after their tombstone is collected. Twig ids only, which are
 * hashes, so this is kept in the clear beside the run.
 */
export const feedMemorySchema = z.object({
  removedIds: z.array(z.string()).default([]),
  dismissedIds: z.array(z.string()).default([]),
});

export type FeedMemory = z.infer<typeof feedMemorySchema>;

export const feedSchema = feedRunSchema.extend({
  ...feedMemorySchema.shape,
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  settings: feedSettingsSchema,
});

export type Feed = z.infer<typeof feedSchema>;

export function defaultFeedSettings(): FeedSettings {
  return {
    name: "",
    url: "",
    branchId: null,
    kind: "other",
    refreshMinutes: 360,
    pastDays: 14,
    completePast: true,
    rules: [],
  };
}

/** `webcal://` is `https://` by another name; anything that is not http(s) is refused. */
export function normalizeFeedUrl(input: string): string | null {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, "https://");

  try {
    const url = new URL(trimmed);

    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Whether a subscription is due another fetch. A file import never is. */
export function isFeedDue(feed: Feed, now: number): boolean {
  const { url, refreshMinutes } = feed.settings;

  if (!url || refreshMinutes <= 0) {
    return false;
  }

  return feed.lastFetchedAt === null || now - feed.lastFetchedAt >= refreshMinutes * 60_000;
}

/**
 * A feed as IndexedDB holds it: the settings sealed into one string, the run in the clear.
 * `encryption` and `keyId` say which cipher sealed `settings`, as on every named row.
 */
export const feedRecordSchema = feedRunSchema.extend({
  ...feedMemorySchema.shape,
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  settings: z.string(),
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
});

export type FeedRecord = z.infer<typeof feedRecordSchema>;
