import { describe, expect, it } from "vitest";

import type { FeedRule } from "./feed-model";
import { applyFeedRules, expandTemplate, patternError, UNTITLED_EVENT } from "./feed-rules";
import type { IcsEvent } from "./ics-parse";
import type { Occurrence } from "./ics-recurrence";

const ZONE = "America/New_York";

function occurrence(overrides: Partial<IcsEvent> = {}, key = overrides.uid ?? "one"): Occurrence {
  const event: IcsEvent = {
    uid: key,
    summary: "Quiz #1 - Due",
    description: "Bring a calculator",
    location: "MECE.203.01-04 - Strength of Materials I",
    categories: ["Assessments"],
    start: { kind: "utc", date: "2026-09-28", minutes: 14 * 60 },
    end: null,
    rrule: null,
    exdates: [],
    recurrenceId: null,
    cancelled: false,
    ...overrides,
  };

  return { key, event, start: event.start, end: event.end };
}

function rule(overrides: Partial<FeedRule>): FeedRule {
  return {
    id: crypto.randomUUID(),
    action: "exclude",
    field: "title",
    pattern: "",
    caseSensitive: false,
    replacement: "",
    kind: "other",
    branchId: "",
    enabled: true,
    ...overrides,
  };
}

const run = (rules: FeedRule[], occurrences = [occurrence()]) =>
  applyFeedRules(occurrences, { kind: "homework", rules }, ZONE);

describe("applyFeedRules", () => {
  it("turns an event into an item with the feed's default kind and no course", () => {
    expect(run([])).toEqual({
      items: [
        {
          key: "one",
          title: "Quiz #1 - Due",
          dueDate: "2026-09-28",
          dueMinutes: 10 * 60,
          timeZone: ZONE,
          kind: "homework",
          branchId: null,
          branchName: null,
        },
      ],
      excluded: 0,
    });
  });

  it("hides what an exclude rule matches, ignoring case unless asked", () => {
    const events = [occurrence({ uid: "a", summary: "Office Hours" }), occurrence({ uid: "b" })];

    expect(run([rule({ pattern: "office hours" })], events)).toMatchObject({
      items: [{ key: "b" }],
      excluded: 1,
    });
    expect(run([rule({ pattern: "office hours", caseSensitive: true })], events).excluded).toBe(0);
  });

  it("keeps only what an include rule matches, on any field", () => {
    const events = [
      occurrence({ uid: "a", categories: ["Assignments", "Graded"] }),
      occurrence({ uid: "b", location: "Somewhere else" }),
    ];

    expect(
      run([rule({ action: "include", field: "location", pattern: "^MECE" })], events),
    ).toMatchObject({
      items: [{ key: "a" }],
      excluded: 1,
    });
    expect(
      run([rule({ action: "include", field: "categories", pattern: "graded" })], events).items,
    ).toHaveLength(1);
    expect(
      run([rule({ action: "exclude", field: "description", pattern: "calculator" })], events).items,
    ).toHaveLength(0);
  });

  it("finds and replaces every match with groups, and later rules see the result", () => {
    const result = run([
      rule({ action: "rename", pattern: " - Due$" }),
      rule({ action: "rename", pattern: "#(\\d)", replacement: "no. $1" }),
      rule({ action: "exclude", pattern: "Due" }),
    ]);

    expect(result.items[0].title).toBe("Quiz no. 1");
  });

  it("falls back on a placeholder when a rename empties the title", () => {
    expect(run([rule({ action: "rename", pattern: ".+" })]).items[0].title).toBe(UNTITLED_EVENT);
  });

  it("sets the kind and the course when a rule matches, and not when it does not", () => {
    const [item] = run([
      rule({ action: "set-kind", pattern: "quiz", kind: "exam" }),
      rule({ action: "set-kind", pattern: "essay", kind: "essay" }),
      rule({ action: "set-branch", pattern: "quiz", branchId: "branch-1" }),
      rule({ action: "set-branch", pattern: "quiz", branchId: "" }),
    ]).items;

    expect(item).toMatchObject({ kind: "exam", branchId: "branch-1", branchName: null });
  });

  it("names a course from a match, and the last course rule wins", () => {
    const pattern = "([A-Z]{4})\\.(\\d{3})\\.\\S+ - (?<name>.+)";
    const [named] = run([
      rule({ action: "set-branch", pattern: ".", branchId: "branch-1" }),
      rule({
        action: "branch-from",
        field: "location",
        pattern,
        caseSensitive: true,
        replacement: "$1 $2 $<name>",
      }),
    ]).items;

    expect(named).toMatchObject({ branchId: null, branchName: "MECE 203 Strength of Materials I" });

    const [whole] = run([
      rule({ action: "branch-from", field: "location", pattern: "MECE\\.\\d+" }),
    ]).items;

    expect(whole.branchName).toBe("MECE.203");

    const [overridden] = run([
      rule({ action: "branch-from", field: "location", pattern: "MECE" }),
      rule({ action: "set-branch", pattern: ".", branchId: "branch-2" }),
    ]).items;

    expect(overridden).toMatchObject({ branchId: "branch-2", branchName: null });
  });

  it("leaves the course alone when a name comes out empty or nothing matches", () => {
    const [item] = run([
      rule({ action: "branch-from", field: "location", pattern: "(x?)MECE", replacement: "$1" }),
      rule({ action: "branch-from", field: "title", pattern: "nothing here" }),
    ]).items;

    expect(item.branchName).toBeNull();
  });

  it("skips a rule that is switched off or does not compile", () => {
    expect(
      run([
        rule({ pattern: "Quiz", enabled: false }),
        rule({ pattern: "(" }),
        rule({ pattern: "" }),
      ]).items,
    ).toHaveLength(1);
  });
});

describe("patternError", () => {
  it("asks for a pattern, reports a broken one, and accepts a good one", () => {
    expect(patternError("")).toBe("Enter a pattern.");
    expect(patternError("(")).toMatch(/unterminated|invalid/i);
    expect(patternError("MECE\\.\\d+", true)).toBeNull();
  });
});

describe("expandTemplate", () => {
  it("expands every token String#replace knows, and leaves a group that is not there", () => {
    const match = /(?<code>[A-Z]+)(\d+)?/.exec("MECE")!;

    expect(expandTemplate("$1|$2|$3|$&|$$|$<code>|$<nope>", match)).toBe("MECE||$3|MECE|$|MECE|");
  });
});
