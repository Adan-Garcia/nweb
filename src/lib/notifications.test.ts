import { describe, expect, it } from "vitest";

import { makeBranch, makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import { buildNotifications, countUrgent, SOON_WINDOW_DAYS } from "./notifications";

// Mid-month, local time, so the day arithmetic never crosses a month or a timezone.
const now = new Date(2026, 3, 16, 10, 30);
const snapshot = makeSnapshot();

const twigOn = (id: string, dueDate: string | null, overrides = {}) =>
  makeTwig({ id, title: `Task ${id}`, dueDate, ...overrides });

describe("buildNotifications", () => {
  it("sorts overdue first, then today, then the coming week", () => {
    const notifications = buildNotifications(
      [twigOn("soon", "2026-04-20"), twigOn("today", "2026-04-16"), twigOn("late", "2026-04-10")],
      snapshot,
      now,
    );

    expect(notifications.map((item) => [item.id, item.kind])).toEqual([
      ["late", "overdue"],
      ["today", "today"],
      ["soon", "soon"],
    ]);
  });

  it("orders within a group by due date, then title", () => {
    const notifications = buildNotifications(
      [
        twigOn("b", "2026-04-10", { title: "Beta" }),
        twigOn("a", "2026-04-10", { title: "Alpha" }),
        twigOn("older", "2026-04-01"),
      ],
      snapshot,
      now,
    );

    expect(notifications.map((item) => item.id)).toEqual(["older", "a", "b"]);
  });

  it("includes the last day of the window and excludes the day after it", () => {
    const inside = new Date(2026, 3, 16 + SOON_WINDOW_DAYS);
    const outside = new Date(2026, 3, 17 + SOON_WINDOW_DAYS);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const notifications = buildNotifications(
      [twigOn("edge", key(inside)), twigOn("past-edge", key(outside))],
      snapshot,
      now,
    );

    expect(notifications.map((item) => item.id)).toEqual(["edge"]);
  });

  it("says nothing about finished, undated or deleted tasks", () => {
    const notifications = buildNotifications(
      [
        twigOn("done", "2026-04-10", { status: "complete" }),
        twigOn("undated", null),
        twigOn("gone", "2026-04-10", { deletedAt: 5 }),
      ],
      snapshot,
      now,
    );

    expect(notifications).toEqual([]);
  });

  it("names the branch through the snapshot, so a rename shows up on the bell", () => {
    const renamed = makeSnapshot({ branches: [makeBranch({ name: "Mathematics" })] });

    expect(buildNotifications([twigOn("a", "2026-04-16")], renamed, now)[0]).toMatchObject({
      branchName: "Mathematics",
      dueTime: "3:30 PM",
    });
  });

  it("says so rather than guessing when the branch is gone", () => {
    const orphan = { wings: [], flights: [], branches: [], nests: [] };

    expect(buildNotifications([twigOn("a", "2026-04-16")], orphan, now)[0].branchName).toBe(
      "No branch",
    );
  });
});

describe("countUrgent", () => {
  it("counts what is late or due today, and not next week's work", () => {
    const notifications = buildNotifications(
      [twigOn("late", "2026-04-10"), twigOn("today", "2026-04-16"), twigOn("soon", "2026-04-20")],
      snapshot,
      now,
    );

    expect(countUrgent(notifications)).toBe(2);
    expect(countUrgent([])).toBe(0);
  });
});
