import { z } from "zod";

import {
  defaultFeedSettings,
  type Feed,
  FEED_REFRESH_MINUTES,
  FEED_RULE_ACTIONS,
  FEED_RULE_FIELDS,
  type FeedRule,
  type FeedSettings,
  normalizeFeedUrl,
} from "@/lib/feeds/feed-model";
import { patternError } from "@/lib/feeds/feed-rules";
import { branchPath, canFileUnder, type WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { TWIG_KINDS } from "@/lib/twigs/twig-model";

/**
 * The feed editor's form: what it holds, how it is checked, and how it maps to and from a
 * feed's stored settings. Selects hand back strings, so the numbers travel as strings here
 * and become numbers only on the way out.
 */
export const REFRESH_OPTIONS: { value: string; label: string }[] = FEED_REFRESH_MINUTES.map(
  (minutes) => ({
    value: String(minutes),
    label:
      minutes === 0
        ? "Only when I refresh it"
        : minutes < 1440
          ? `Every ${minutes / 60} hour${minutes === 60 ? "" : "s"}`
          : "Once a day",
  }),
);

const ruleFormSchema = z
  .object({
    id: z.string(),
    action: z.enum(FEED_RULE_ACTIONS),
    field: z.enum(FEED_RULE_FIELDS),
    pattern: z.string().max(500),
    caseSensitive: z.boolean(),
    replacement: z.string().max(500),
    kind: z.enum(TWIG_KINDS),
    branchId: z.string(),
    enabled: z.boolean(),
  })
  .superRefine((rule, context) => {
    const error = patternError(rule.pattern, rule.caseSensitive);

    if (error) {
      context.addIssue({ code: "custom", path: ["pattern"], message: error });
    }

    if (rule.action === "set-branch" && !rule.branchId) {
      context.addIssue({ code: "custom", path: ["branchId"], message: "Choose a course." });
    }
  });

export const feedFormSchema = z
  .object({
    source: z.enum(["url", "file"]),
    name: z.string().trim().min(1, "Give this calendar a name.").max(200),
    url: z.string().max(2048),
    branchId: z.string(),
    kind: z.enum(TWIG_KINDS),
    refreshMinutes: z.string(),
    pastDays: z.string().regex(/^\d{0,4}$/, "A number of days, or empty for everything."),
    completePast: z.boolean(),
    rules: z.array(ruleFormSchema).max(100),
  })
  .superRefine((values, context) => {
    if (values.source === "url" && !normalizeFeedUrl(values.url)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Paste the calendar's address. It starts with https:// or webcal://.",
      });
    }
  });

export type FeedFormValues = z.infer<typeof feedFormSchema>;

export type FeedRuleFormValues = FeedFormValues["rules"][number];

export function toFormValues(feed: Feed | null): FeedFormValues {
  const settings = feed?.settings ?? defaultFeedSettings();

  return {
    source: feed && !settings.url ? "file" : "url",
    name: settings.name,
    url: settings.url,
    branchId: settings.branchId ?? "",
    kind: settings.kind,
    refreshMinutes: String(settings.refreshMinutes),
    pastDays: settings.pastDays === null ? "" : String(settings.pastDays),
    completePast: settings.completePast,
    rules: settings.rules,
  };
}

export function toFeedSettings(values: FeedFormValues): FeedSettings {
  const isUrl = values.source === "url";

  return {
    name: values.name.trim(),
    url: isUrl ? (normalizeFeedUrl(values.url) ?? "") : "",
    branchId: values.branchId || null,
    kind: values.kind,
    refreshMinutes: isUrl ? Number(values.refreshMinutes) : 0,
    pastDays: values.pastDays === "" ? null : Number(values.pastDays),
    completePast: values.completePast,
    rules: values.rules,
  };
}

export function newRule(): FeedRule {
  return {
    id: crypto.randomUUID(),
    action: "exclude",
    field: "title",
    pattern: "",
    caseSensitive: false,
    replacement: "",
    kind: "exam",
    branchId: "",
    enabled: true,
  };
}

export type BranchOption = { id: string; label: string };

/** The courses a feed may file into: this workspace's own, labelled with their term. */
export function feedBranchOptions(snapshot: WorkspaceSnapshot): BranchOption[] {
  return snapshot.branches
    .filter((branch) => canFileUnder(snapshot, branch.id))
    .map((branch) => {
      const flight = branchPath(snapshot, branch.id)?.flight;

      return { id: branch.id, label: flight ? `${flight.name} / ${branch.name}` : branch.name };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}
