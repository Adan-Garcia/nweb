import { describe, expect, it } from "vitest"

import {
  eventFormSchema,
  formatDateKey,
  formatHumanDate,
  startOfWeek,
  statusOrder,
} from "./calendar-shared"

describe("formatDateKey", () => {
  it("zero-pads month and day", () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(formatDateKey(new Date(2026, 11, 25))).toBe("2026-12-25")
  })
})

describe("startOfWeek", () => {
  it("returns the preceding Sunday at local midnight", () => {
    // 2026-04-16 is a Thursday.
    const result = startOfWeek(new Date(2026, 3, 16, 15, 30))
    expect(formatDateKey(result)).toBe("2026-04-12")
    expect(result.getHours()).toBe(0)
  })

  it("returns the same day when given a Sunday, without mutating the input", () => {
    const sunday = new Date(2026, 3, 12, 8, 0)
    expect(formatDateKey(startOfWeek(sunday))).toBe("2026-04-12")
    expect(sunday.getHours()).toBe(8)
  })
})

describe("formatHumanDate", () => {
  it("renders a readable en-US date from a date key", () => {
    expect(formatHumanDate("2026-04-16")).toBe("Thu, Apr 16, 2026")
  })
})

describe("statusOrder", () => {
  it("lists statuses from todo to done", () => {
    expect(statusOrder).toEqual(["incomplete", "inprogress", "complete"])
  })
})

describe("eventFormSchema", () => {
  const valid = { title: "Quiz", date: "2026-04-27", time: "10:00 AM", color: "Chemistry", status: "inprogress" }

  it("accepts a valid form", () => {
    expect(eventFormSchema.safeParse(valid).success).toBe(true)
  })

  it("requires a non-blank title and time", () => {
    const blank = eventFormSchema.safeParse({ ...valid, title: "   ", time: "" })
    expect(blank.success).toBe(false)
    expect(blank.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Title is required", "Time is required"]),
    )
  })

  it("rejects malformed and impossible dates", () => {
    expect(eventFormSchema.safeParse({ ...valid, date: "04/27/2026" }).error?.issues[0].message).toBe(
      "Use YYYY-MM-DD format",
    )
    expect(eventFormSchema.safeParse({ ...valid, date: "2026-13-45" }).error?.issues[0].message).toBe(
      "Enter a valid date",
    )
  })
})
