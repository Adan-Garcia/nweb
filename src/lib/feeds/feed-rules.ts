import type { TwigKind } from "../twigs/twig-model";
import type { FeedRule, FeedRuleField, FeedSettings } from "./feed-model";
import type { Occurrence } from "./ics-occurrences";
import { toDueAt } from "./ics-time";

/**
 * What a feed's rules make of its events: which are kept, what they are called, which
 * course they go in and what kind of task each is.
 *
 * Pure, so the settings page can preview a rule on every keystroke against a calendar it
 * already fetched, and the refresh applies exactly what was previewed.
 */
export type FeedItem = {
  key: string;
  title: string;
  dueDate: string;
  dueMinutes: number | null;
  timeZone: string;
  kind: TwigKind;
  /** Set by a `set-branch` rule. */
  branchId: string | null;
  /** Set by a `branch-from` rule: a course name, found or created when applied. */
  branchName: string | null;
};

export type FeedRulesResult = { items: FeedItem[]; excluded: number };

export const UNTITLED_EVENT = "Untitled event";

function flagsFor(rule: Pick<FeedRule, "caseSensitive">, global = false): string {
  return `${rule.caseSensitive ? "" : "i"}${global ? "g" : ""}`;
}

/** Why a pattern will not compile, or null when it does. */
export function patternError(pattern: string, caseSensitive = false): string | null {
  if (!pattern) {
    return "Enter a pattern.";
  }

  try {
    new RegExp(pattern, flagsFor({ caseSensitive }));

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Not a valid pattern.";
  }
}

/** `$1`, `$<name>`, `$&` and `$$`, as `String#replace` reads them. */
export function expandTemplate(template: string, match: RegExpExecArray): string {
  return template.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (token, name: string, group?: string) => {
    if (name === "$") {
      return "$";
    }

    if (name === "&") {
      return match[0];
    }

    if (group !== undefined) {
      return match.groups?.[group] ?? "";
    }

    const index = Number(name);

    return index < match.length ? (match[index] ?? "") : token;
  });
}

type Fields = Record<FeedRuleField, string>;

type Working = {
  fields: Fields;
  kind: TwigKind;
  branchId: string | null;
  branchName: string | null;
};

/** One rule against one event. Returns false when the event is dropped. */
function applyRule(rule: FeedRule, pattern: RegExp, working: Working): boolean {
  const value = working.fields[rule.field];
  const match = pattern.exec(value);

  switch (rule.action) {
    case "exclude":
      return match === null;
    case "include":
      return match !== null;
    case "rename":
      working.fields[rule.field] = value
        .replace(new RegExp(pattern.source, flagsFor(rule, true)), rule.replacement)
        .trim();
      return true;
    case "set-kind":
      if (match) {
        working.kind = rule.kind;
      }
      return true;
    case "set-branch":
      if (match && rule.branchId) {
        working.branchId = rule.branchId;
        working.branchName = null;
      }
      return true;
    case "branch-from": {
      const name = match ? expandTemplate(rule.replacement || "$&", match).trim() : "";

      if (name) {
        working.branchName = name;
        working.branchId = null;
      }
      return true;
    }
  }
}

/** The rules that can run: switched on and with a pattern that compiles. */
function compileRules(rules: FeedRule[]): { rule: FeedRule; pattern: RegExp }[] {
  return rules.flatMap((rule) =>
    rule.enabled && patternError(rule.pattern, rule.caseSensitive) === null
      ? [{ rule, pattern: new RegExp(rule.pattern, flagsFor(rule)) }]
      : [],
  );
}

export function applyFeedRules(
  occurrences: Occurrence[],
  settings: Pick<FeedSettings, "kind" | "rules">,
  deviceZone: string,
): FeedRulesResult {
  const compiled = compileRules(settings.rules);
  const items: FeedItem[] = [];
  let excluded = 0;

  for (const { key, event, start, end } of occurrences) {
    const working: Working = {
      fields: {
        title: event.summary,
        description: event.description,
        location: event.location,
        categories: event.categories.join(", "),
      },
      kind: settings.kind,
      branchId: null,
      branchName: null,
    };

    if (!compiled.every(({ rule, pattern }) => applyRule(rule, pattern, working))) {
      excluded += 1;
      continue;
    }

    items.push({
      key,
      title: working.fields.title || UNTITLED_EVENT,
      ...toDueAt(start, end, deviceZone),
      kind: working.kind,
      branchId: working.branchId,
      branchName: working.branchName,
    });
  }

  return { items, excluded };
}
