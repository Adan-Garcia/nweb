import type { FeedRule } from "./feed-model";

/**
 * Starting rules for the learning platforms whose feeds students most often paste in.
 *
 * Each platform writes its course into a different field, and pads the calendar with events
 * that are not deadlines — Brightspace adds an "Available" and an "Availability Ends" for
 * every quiz. A preset is only a starting point: it is copied into the feed's rules, where
 * it can be edited like any other.
 */
export type FeedPreset = { id: string; label: string; rules: Omit<FeedRule, "id">[] };

const RULE_DEFAULTS = {
  caseSensitive: false,
  replacement: "",
  kind: "other",
  branchId: "",
  enabled: true,
} as const;

export const FEED_PRESETS: FeedPreset[] = [
  {
    id: "brightspace",
    label: "Brightspace (D2L, myCourses)",
    rules: [
      {
        ...RULE_DEFAULTS,
        action: "exclude",
        field: "title",
        pattern: " - (Available|Availability Ends)$",
      },
      { ...RULE_DEFAULTS, action: "exclude", field: "title", pattern: "office hours" },
      { ...RULE_DEFAULTS, action: "rename", field: "title", pattern: " - Due$" },
      {
        ...RULE_DEFAULTS,
        action: "branch-from",
        field: "location",
        pattern: "([A-Z]{2,5})\\.(\\d{2,4})\\.\\S+ - ([^)]+)",
        caseSensitive: true,
        replacement: "$1 $2 $3",
      },
      {
        ...RULE_DEFAULTS,
        action: "set-kind",
        field: "title",
        pattern: "quiz|exam|midterm|final",
        kind: "exam",
      },
      {
        ...RULE_DEFAULTS,
        action: "set-kind",
        field: "title",
        pattern: "assignment|homework|dropbox|hw\\b",
        kind: "homework",
      },
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    rules: [
      {
        ...RULE_DEFAULTS,
        action: "branch-from",
        field: "title",
        pattern: "\\[([^\\]]+)\\]\\s*$",
        replacement: "$1",
      },
      { ...RULE_DEFAULTS, action: "rename", field: "title", pattern: "\\s*\\[[^\\]]+\\]\\s*$" },
      {
        ...RULE_DEFAULTS,
        action: "set-kind",
        field: "title",
        pattern: "quiz|exam|midterm|final",
        kind: "exam",
      },
    ],
  },
  {
    id: "no-meetings",
    label: "Hide lectures, labs and office hours",
    rules: [
      {
        ...RULE_DEFAULTS,
        action: "exclude",
        field: "title",
        pattern: "\\b(lecture|recitation|studio|office hours|lab section|seminar)\\b",
      },
    ],
  },
];

/** A preset's rules with fresh ids, ready to append to a feed's own. */
export function presetRules(preset: FeedPreset): FeedRule[] {
  return preset.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() }));
}
