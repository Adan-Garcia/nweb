import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/calendar-event"
import {
  buildMonthCells,
  buildWeekDates,
  filterVisibleEvents,
  formatMonthLabel,
  formatWeekLabel,
  groupEventsByDate,
  listEventClasses,
  nextEventId,
  scopeEventsToView,
  startOfDay,
  startOfMonth,
} from "./calendar-views"
import { formatDateKey } from "./calendar-shared"

// Mid-month dates keep these tests independent of the machine's timezone.
function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id">): CalendarEvent {
  return {
    title: `Event ${overrides.id}`,
    date: "2026-04-15",
    time: "9:00 AM",
    color: "Math",
    status: "incomplete",
    ...overrides,
  }
}

describe("buildMonthCells", () => {
  it("pads April 2026 (starts Wednesday, 30 days) to five whole weeks", () => {
    const cells = buildMonthCells(new Date(2026, 3, 1))

    expect(cells).toHaveLength(35)
    expect(formatDateKey(cells[0])).toBe("2026-03-29")
    expect(formatDateKey(cells[3])).toBe("2026-04-01")
    expect(formatDateKey(cells[32])).toBe("2026-04-30")
    expect(formatDateKey(cells[34])).toBe("2026-05-02")
  })

  it("adds no leading padding when the month starts on Sunday", () => {
    const cells = buildMonthCells(new Date(2026, 1, 1)) // Feb 2026: Sunday start, 28 days
    expect(cells).toHaveLength(28)
    expect(formatDateKey(cells[0])).toBe("2026-02-01")
    expect(formatDateKey(cells[27])).toBe("2026-02-28")
  })

  it("always returns whole weeks", () => {
    for (let month = 0; month < 12; month++) {
      expect(buildMonthCells(new Date(2026, month, 1)).length % 7).toBe(0)
    }
  })
})

describe("buildWeekDates", () => {
  it("returns Sunday through Saturday around the focused date", () => {
    const week = buildWeekDates(new Date(2026, 3, 16)) // Thursday
    expect(week.map(formatDateKey)).toEqual([
      "2026-04-12",
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
    ])
  })
})

describe("labels", () => {
  it("formats the month label", () => {
    expect(formatMonthLabel(new Date(2026, 3, 1))).toBe("April 2026")
  })

  it("formats a week inside one month", () => {
    expect(formatWeekLabel(buildWeekDates(new Date(2026, 3, 16)))).toBe("Apr 12-18, 2026")
  })

  it("formats a week that spans two months", () => {
    expect(formatWeekLabel(buildWeekDates(new Date(2026, 3, 30)))).toBe("Apr 26 - May 2, 2026")
  })
})

describe("groupEventsByDate", () => {
  it("buckets events by their date key", () => {
    const grouped = groupEventsByDate([
      event({ id: 1, date: "2026-04-15" }),
      event({ id: 2, date: "2026-04-15" }),
      event({ id: 3, date: "2026-04-20" }),
    ])
    expect(grouped.get("2026-04-15")?.map((item) => item.id)).toEqual([1, 2])
    expect(grouped.get("2026-04-20")?.map((item) => item.id)).toEqual([3])
    expect(grouped.get("2026-04-21")).toBeUndefined()
  })
})

describe("scopeEventsToView", () => {
  const events = [
    event({ id: 1, date: "2026-04-15" }),
    event({ id: 2, date: "2026-05-15" }),
    event({ id: 3, date: "2025-04-15" }),
  ]

  it("keeps only events in the visible month (and year)", () => {
    const scoped = scopeEventsToView({
      events,
      viewMode: "month",
      currentMonth: new Date(2026, 3, 1),
      weekDates: buildWeekDates(new Date(2026, 3, 16)),
    })
    expect(scoped.map((item) => item.id)).toEqual([1])
  })

  it("puts an event on the 1st, and one on the last day, in their own month", () => {
    const edges = [event({ id: 1, date: "2026-04-01" }), event({ id: 2, date: "2026-04-30" }), event({ id: 3, date: "2026-03-31" })]
    const scoped = scopeEventsToView({
      events: edges,
      viewMode: "month",
      currentMonth: new Date(2026, 3, 1),
      weekDates: buildWeekDates(new Date(2026, 3, 16)),
    })
    expect(scoped.map((item) => item.id)).toEqual([1, 2])
  })

  it("keeps only events in the visible week", () => {
    const scoped = scopeEventsToView({
      events: [event({ id: 1, date: "2026-04-14" }), event({ id: 2, date: "2026-04-25" })],
      viewMode: "week",
      currentMonth: new Date(2026, 3, 1),
      weekDates: buildWeekDates(new Date(2026, 3, 16)),
    })
    expect(scoped.map((item) => item.id)).toEqual([1])
  })
})

describe("filterVisibleEvents", () => {
  const events = [
    event({ id: 1, title: "Math Quiz", color: "Math", status: "incomplete", date: "2026-04-15" }),
    event({ id: 2, title: "History Essay", color: "History", status: "complete", date: "2026-04-15" }),
    event({ id: 3, title: "math homework", color: "Math", status: "inprogress", date: "2026-04-16" }),
  ]
  const base = { events, selectedDateKey: null, searchTerm: "", classFilter: "all", eventTab: "active" as const }

  it("shows unfinished events on the active tab and finished ones on the completed tab", () => {
    expect(filterVisibleEvents(base).map((item) => item.id)).toEqual([1, 3])
    expect(filterVisibleEvents({ ...base, eventTab: "completed" }).map((item) => item.id)).toEqual([2])
  })

  it("filters by selected day", () => {
    expect(filterVisibleEvents({ ...base, selectedDateKey: "2026-04-16" }).map((item) => item.id)).toEqual([3])
  })

  it("searches titles case-insensitively and ignores a blank search", () => {
    expect(filterVisibleEvents({ ...base, searchTerm: "MATH" }).map((item) => item.id)).toEqual([1, 3])
    expect(filterVisibleEvents({ ...base, searchTerm: "   " }).map((item) => item.id)).toEqual([1, 3])
  })

  it("filters by class", () => {
    expect(
      filterVisibleEvents({ ...base, eventTab: "completed", classFilter: "History" }).map((item) => item.id),
    ).toEqual([2])
    expect(filterVisibleEvents({ ...base, classFilter: "History" })).toEqual([])
  })
})

describe("small helpers", () => {
  it("lists distinct classes alphabetically", () => {
    expect(
      listEventClasses([
        event({ id: 1, color: "Physics" }),
        event({ id: 2, color: "History" }),
        event({ id: 3, color: "Physics" }),
      ]),
    ).toEqual(["History", "Physics"])
  })

  it("picks the next event id", () => {
    expect(nextEventId([])).toBe(1)
    expect(nextEventId([event({ id: 4 }), event({ id: 9 })])).toBe(10)
  })

  it("normalizes dates to the start of the month or day", () => {
    const date = new Date(2026, 3, 16, 15, 30)
    expect(formatDateKey(startOfMonth(date))).toBe("2026-04-01")
    expect(startOfDay(date).getHours()).toBe(0)
  })
})
