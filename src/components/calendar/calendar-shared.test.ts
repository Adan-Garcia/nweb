import { describe, expect, it } from "vitest";

import { makeBranch, makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import {
  branchLabelFor,
  dateKeyToDate,
  formatDateKey,
  formatHumanDate,
  formatShortDate,
  isDatedTwig,
  startOfWeek,
  statusOrder,
  twigFormSchema,
} from "./calendar-shared";

describe("formatDateKey", () => {
  it("zero-pads month and day", () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDateKey(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("startOfWeek", () => {
  it("returns the preceding Sunday at local midnight", () => {
    // 2026-04-16 is a Thursday.
    const result = startOfWeek(new Date(2026, 3, 16, 15, 30));
    expect(formatDateKey(result)).toBe("2026-04-12");
    expect(result.getHours()).toBe(0);
  });

  it("returns the same day when given a Sunday, without mutating the input", () => {
    const sunday = new Date(2026, 3, 12, 8, 0);
    expect(formatDateKey(startOfWeek(sunday))).toBe("2026-04-12");
    expect(sunday.getHours()).toBe(8);
  });
});

describe("formatHumanDate", () => {
  it("renders a readable en-US date from a date key", () => {
    expect(formatHumanDate("2026-04-16")).toBe("Thu, Apr 16, 2026");
  });
});

describe("dateKeyToDate", () => {
  it("is local midnight of the given day (not UTC, which shifts the day west of UTC)", () => {
    const date = dateKeyToDate("2026-04-01");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 3, 1, 0,
    ]);
  });
});

describe("formatShortDate", () => {
  it("renders the month and day of a date key, including the 1st of a month", () => {
    expect(formatShortDate("2026-04-01")).toBe("Apr 1");
    expect(formatShortDate("2026-12-31")).toBe("Dec 31");
  });
});

describe("statusOrder", () => {
  it("lists statuses from todo to done", () => {
    expect(statusOrder).toEqual(["incomplete", "inprogress", "complete"]);
  });
});

describe("twigFormSchema", () => {
  const valid = {
    title: "Quiz",
    date: "2026-04-27",
    time: "10:00 AM",
    branchId: "branch-1",
    kind: "exam",
    status: "inprogress",
  };

  it("accepts a valid form", () => {
    expect(twigFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a non-blank title and time", () => {
    const blank = twigFormSchema.safeParse({ ...valid, title: "   ", time: "" });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Title is required", "Time is required"]),
    );
  });

  it("requires a branch, because a task has to belong to a course", () => {
    const orphan = twigFormSchema.safeParse({ ...valid, branchId: "" });

    expect(orphan.success).toBe(false);
    expect(orphan.error?.issues.map((issue) => issue.message)).toContain("Pick a branch");
  });

  it("rejects malformed and impossible dates", () => {
    expect(
      twigFormSchema.safeParse({ ...valid, date: "04/27/2026" }).error?.issues[0].message,
    ).toBe("Use YYYY-MM-DD format");
    expect(
      twigFormSchema.safeParse({ ...valid, date: "2026-13-45" }).error?.issues[0].message,
    ).toBe("Enter a valid date");
  });
});

describe("isDatedTwig", () => {
  it("keeps only the tasks that belong on a calendar", () => {
    expect(isDatedTwig(makeTwig({ dueDate: "2026-04-27" }))).toBe(true);
    expect(isDatedTwig(makeTwig({ dueDate: null }))).toBe(false);
  });
});

describe("branchLabelFor", () => {
  it("reads the name and dot colour off the branch the task belongs to", () => {
    const snapshot = makeSnapshot({ branches: [makeBranch({ color: "rose" })] });

    expect(branchLabelFor(snapshot, "branch-1")).toEqual({
      name: "Biology 101",
      colorClass: "bg-rose-500",
    });
  });

  it("says so rather than guessing when the branch is gone", () => {
    expect(branchLabelFor(makeSnapshot(), "no-such-branch")).toEqual({
      name: "No branch",
      colorClass: "bg-slate-400",
    });
  });
});
