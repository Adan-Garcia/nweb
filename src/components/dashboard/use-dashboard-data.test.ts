import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { formatDateKey } from "@/components/calendar/calendar-shared"
import type { CalendarEvent } from "@/lib/calendar-event"
import { upsertNotesDirectoryEntry } from "@/lib/notes-directory-storage"
import { useDashboardData } from "./use-dashboard-data"

const STORAGE_KEY = "cuervo-calendar-events-v1"

describe("useDashboardData", () => {
  it("derives the dashboard from stored events and saved notes", async () => {
    const today = formatDateKey(new Date())
    const stored: CalendarEvent[] = [
      { id: 1, title: "Due now", date: today, time: "9:00 AM", color: "Math", status: "incomplete" },
      { id: 2, title: "Long gone", date: "2000-01-01", time: "9:00 AM", color: "Math", status: "incomplete" },
    ]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    await upsertNotesDirectoryEntry({
      id: "dashboard-note",
      location: { wing: "W", flight: "F", branch: "B", nest: "N", feather: "Dashboard note" },
    })

    const { result } = renderHook(() => useDashboardData())
    expect(result.current.isNotesLoading).toBe(true)

    await waitFor(() => expect(result.current.isNotesLoading).toBe(false))

    expect(result.current.dueToday.map((item) => item.title)).toEqual(["Due now"])
    expect(result.current.overdueCount).toBe(1)
    expect(result.current.nextPriority?.title).toBe("Due now")
    expect(result.current.recentNotes.map((entry) => entry.id)).toContain("dashboard-note")
    expect(result.current.notesUpdatedThisWeekCount).toBeGreaterThanOrEqual(1)
  })
})
