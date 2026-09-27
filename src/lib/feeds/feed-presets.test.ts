import { describe, expect, it } from "vitest";

import { FEED_PRESETS, presetRules } from "./feed-presets";
import { applyFeedRules } from "./feed-rules";
import type { IcsEvent } from "./ics-parse";

function occurrence(summary: string, location = "") {
  const event: IcsEvent = {
    uid: summary,
    summary,
    description: "",
    location,
    categories: [],
    start: { kind: "date", date: "2026-09-28" },
    end: null,
    rrule: null,
    exdates: [],
    recurrenceId: null,
    cancelled: false,
  };

  return { key: summary, event, start: event.start, end: null };
}

const preset = (id: string) => FEED_PRESETS.find((candidate) => candidate.id === id)!;

describe("feed presets", () => {
  it("gives each rule a fresh id", () => {
    const [first, second] = presetRules(preset("canvas"));

    expect(first.id).not.toBe(second.id);
  });

  it("keeps Brightspace deadlines, drops the availability windows, and files by course", () => {
    const location = "Zoom Online Meeting (MECE.102.01-06 - Engineering Mechanics Lab)";
    const { items } = applyFeedRules(
      [
        occurrence("QUIZ #1 - Available", location),
        occurrence("QUIZ #1 - Due", location),
        occurrence("QUIZ #1 - Availability Ends", location),
        occurrence("Homework 3 - Due", "MECE.104.01-04/LA/LB - Engineering Design Tools"),
        occurrence("TA Office Hours", location),
      ],
      { kind: "other", rules: presetRules(preset("brightspace")) },
      "America/New_York",
    );

    expect(items.map(({ title, kind, branchName }) => [title, kind, branchName])).toEqual([
      ["QUIZ #1", "exam", "MECE 102 Engineering Mechanics Lab"],
      ["Homework 3", "homework", "MECE 104 Engineering Design Tools"],
    ]);
  });

  it("takes Canvas's course from the brackets in the title", () => {
    const { items } = applyFeedRules(
      [occurrence("Midterm Exam [PHYS 211]")],
      { kind: "other", rules: presetRules(preset("canvas")) },
      "America/New_York",
    );

    expect(items[0]).toMatchObject({ title: "Midterm Exam", kind: "exam", branchName: "PHYS 211" });
  });

  it("hides class meetings", () => {
    const { items } = applyFeedRules(
      [occurrence("MECE 102 Lecture 8am"), occurrence("Lab report due")],
      { kind: "other", rules: presetRules(preset("no-meetings")) },
      "America/New_York",
    );

    expect(items.map((item) => item.title)).toEqual(["Lab report due"]);
  });
});
