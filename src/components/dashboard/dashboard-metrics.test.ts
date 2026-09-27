import { describe, expect, it } from "vitest";

import type { DatedTwig } from "@/components/calendar/calendar-shared";
import type { NotesDirectoryEntry } from "@/lib/notes/notes-model";
import { makeEntry, makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import { computeDashboardMetrics, formatLastUpdated, toLocationLabel } from "./dashboard-metrics";

// Thursday, local time. Local-time constructors keep this timezone-independent.
const now = new Date(2026, 3, 16, 10, 30);

function event(id: number, dueDate: string, overrides: Partial<DatedTwig> = {}): DatedTwig {
  return {
    ...makeTwig({ id: String(id), title: `Event ${id}`, dueTime: "9:00 AM" }),
    dueDate,
    ...overrides,
  };
}

function note(id: string, updatedAt: number): NotesDirectoryEntry {
  return makeEntry({ id, feather: id, updatedAt });
}

const empty = { calendarEvents: [], notesEntries: [], now };

describe("formatLastUpdated", () => {
  const at = (offsetMs: number) => formatLastUpdated(now.getTime() - offsetMs, now.getTime());
  const minute = 60_000;

  it("uses relative units up to a week", () => {
    expect(at(30_000)).toBe("just now");
    expect(at(5 * minute)).toBe("5m ago");
    expect(at(59 * minute)).toBe("59m ago");
    expect(at(60 * minute)).toBe("1h ago");
    expect(at(23 * 60 * minute)).toBe("23h ago");
    expect(at(24 * 60 * minute)).toBe("1d ago");
    expect(at(6 * 24 * 60 * minute)).toBe("6d ago");
  });

  it("switches to a short date after a week", () => {
    const overAWeekAgo = new Date(2026, 3, 8, 12).getTime(); // 7 days 22.5 hours before `now`
    expect(formatLastUpdated(overAWeekAgo, now.getTime())).toBe("Apr 8");
  });
});

describe("toLocationLabel", () => {
  it("reads the branch name off the entity, so a rename shows up here too", () => {
    expect(toLocationLabel(makeSnapshot(), note("Exam review", 0))).toBe(
      "Biology 101 / Exam review",
    );
  });

  it("falls back to the note's own title when its branch is gone", () => {
    expect(
      toLocationLabel({ wings: [], flights: [], branches: [], nests: [] }, note("Orphan", 0)),
    ).toBe("Orphan");
  });
});

describe("computeDashboardMetrics", () => {
  it("is all zeros and empty with no data", () => {
    expect(computeDashboardMetrics(empty)).toEqual({
      dueToday: [],
      overdueCount: 0,
      upcomingEvents: [],
      upcomingPreview: [],
      recentNotes: [],
      notesUpdatedThisWeekCount: 0,
      nextPriority: null,
    });
  });

  it("finds what is due today, including completed events", () => {
    const { dueToday } = computeDashboardMetrics({
      ...empty,
      calendarEvents: [
        event(1, "2026-04-16"),
        event(2, "2026-04-16", { status: "complete" }),
        event(3, "2026-04-17"),
      ],
    });
    expect(dueToday.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("counts only incomplete events before today as overdue", () => {
    const { overdueCount } = computeDashboardMetrics({
      ...empty,
      calendarEvents: [
        event(1, "2026-04-15"),
        event(2, "2026-04-01", { status: "inprogress" }),
        event(3, "2026-04-10", { status: "complete" }),
        event(4, "2026-04-16"),
      ],
    });
    expect(overdueCount).toBe(2);
  });

  it("lists incomplete events from today through seven days out, soonest first", () => {
    const { upcomingEvents, nextPriority, upcomingPreview } = computeDashboardMetrics({
      ...empty,
      calendarEvents: [
        event(1, "2026-04-23"), // exactly seven days out: included
        event(2, "2026-04-24"), // eight days out: excluded
        event(3, "2026-04-16"),
        event(4, "2026-04-18", { status: "complete" }),
        event(5, "2026-04-15"), // overdue, not upcoming
        event(6, "2026-04-17"),
      ],
    });

    expect(upcomingEvents.map((item) => item.id)).toEqual(["3", "6", "1"]);
    expect(nextPriority?.id).toBe("3");
    expect(upcomingPreview).toEqual(upcomingEvents);
  });

  it("previews at most five upcoming events without shortening the count", () => {
    const calendarEvents = Array.from({ length: 7 }, (_, index) => event(index + 1, "2026-04-18"));
    const { upcomingEvents, upcomingPreview } = computeDashboardMetrics({
      ...empty,
      calendarEvents,
    });
    expect(upcomingEvents).toHaveLength(7);
    expect(upcomingPreview).toHaveLength(5);
  });

  it("does not reorder the input list", () => {
    const calendarEvents = [event(1, "2026-04-20"), event(2, "2026-04-17")];
    computeDashboardMetrics({ ...empty, calendarEvents });
    expect(calendarEvents.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("shows the five most recently updated notes and counts this week's edits", () => {
    const day = 24 * 60 * 60 * 1000;
    const notesEntries = [
      note("old", now.getTime() - 30 * day),
      note("a", now.getTime() - 1 * day),
      note("b", now.getTime() - 2 * day),
      note("c", now.getTime() - 3 * day),
      note("d", now.getTime() - 4 * day),
      note("edge", now.getTime() - 7 * day),
      note("just-outside", now.getTime() - 7 * day - 1),
    ];

    const { recentNotes, notesUpdatedThisWeekCount } = computeDashboardMetrics({
      ...empty,
      notesEntries,
    });

    expect(recentNotes.map((item) => item.id)).toEqual(["a", "b", "c", "d", "edge"]);
    expect(notesUpdatedThisWeekCount).toBe(5);
  });
});
