import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"

import type { CalendarEvent } from "@/lib/calendar-event"
import { CalendarEventListCard } from "./calendar-event-list-card"

const quiz: CalendarEvent = { id: 1, title: "Math Quiz", date: "2026-04-16", time: "9:00 AM", color: "Math", status: "incomplete" }
const essay: CalendarEvent = { id: 2, title: "History Essay", date: "2026-04-18", time: "11:59 PM", color: "History", status: "complete" }

function setup(overrides: Partial<ComponentProps<typeof CalendarEventListCard>> = {}) {
  const props: ComponentProps<typeof CalendarEventListCard> = {
    selectedDateKey: null,
    viewMode: "month",
    weekLabel: "Apr 12-18, 2026",
    monthLabel: "April 2026",
    eventTab: "active",
    onEventTabChange: vi.fn(),
    onClearDayFilter: vi.fn(),
    searchTerm: "",
    onSearchTermChange: vi.fn(),
    selectedClassFilter: "all",
    onSelectedClassFilterChange: vi.fn(),
    eventClasses: ["History", "Math"],
    filteredEvents: [quiz, essay],
    onOpenAddEvent: vi.fn(),
    onOpenEditEvent: vi.fn(),
    onDeleteEvent: vi.fn(),
    onSetEventStatus: vi.fn(),
    ...overrides,
  }
  render(<CalendarEventListCard {...props} />)
  return props
}

describe("CalendarEventListCard: heading", () => {
  it("names the month by default", () => {
    setup()
    expect(screen.getByText("Events in April 2026")).toBeInTheDocument()
  })

  it("names the week in week view", () => {
    setup({ viewMode: "week" })
    expect(screen.getByText("Events in Apr 12-18, 2026")).toBeInTheDocument()
  })

  it("names the selected day, which takes precedence", () => {
    setup({ viewMode: "week", selectedDateKey: "2026-04-16" })
    expect(screen.getByText("Events on Thu, Apr 16, 2026")).toBeInTheDocument()
  })
})

describe("CalendarEventListCard: filters", () => {
  it("switches between the active and completed lists", async () => {
    const user = userEvent.setup()
    const { onEventTabChange } = setup()

    await user.click(screen.getByRole("button", { name: "Completed" }))
    await user.click(screen.getByRole("button", { name: "Active" }))

    expect(onEventTabChange).toHaveBeenNthCalledWith(1, "completed")
    expect(onEventTabChange).toHaveBeenNthCalledWith(2, "active")
  })

  it("offers to clear the day filter only when a day is selected", async () => {
    const user = userEvent.setup()
    const { onClearDayFilter } = setup({ selectedDateKey: "2026-04-16" })

    await user.click(screen.getByRole("button", { name: "Clear day filter" }))

    expect(onClearDayFilter).toHaveBeenCalledOnce()
  })

  it("has no clear button without a selected day", () => {
    setup()
    expect(screen.queryByRole("button", { name: "Clear day filter" })).not.toBeInTheDocument()
  })

  it("reports search text as it is typed", async () => {
    const user = userEvent.setup()
    const { onSearchTermChange } = setup()

    await user.type(screen.getByRole("textbox", { name: "Search events" }), "m")

    expect(onSearchTermChange).toHaveBeenCalledWith("m")
  })

  it("filters by class, listing only the classes in view", async () => {
    const user = userEvent.setup()
    const { onSelectedClassFilterChange } = setup()
    const select = screen.getByRole("combobox", { name: "Filter events by class" })

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["All Classes", "History", "Math"])
    await user.selectOptions(select, "Math")

    expect(onSelectedClassFilterChange).toHaveBeenCalledWith("Math")
  })
})

describe("CalendarEventListCard: events", () => {
  it("lists each event with its time and class", () => {
    setup()
    expect(screen.getByText("Math Quiz")).toBeInTheDocument()
    expect(screen.getByText("History Essay")).toBeInTheDocument()
    expect(screen.getByText(/at 9:00 AM/)).toBeInTheDocument()
    expect(screen.getByText("Class: History")).toBeInTheDocument()
  })

  it("edits and deletes the event whose buttons were clicked", async () => {
    const user = userEvent.setup()
    const { onOpenEditEvent, onDeleteEvent } = setup()

    await user.click(screen.getByRole("button", { name: "Edit History Essay" }))
    await user.click(screen.getByRole("button", { name: "Delete Math Quiz" }))

    expect(onOpenEditEvent).toHaveBeenCalledWith(essay)
    expect(onDeleteEvent).toHaveBeenCalledWith(quiz)
  })

  it("strikes through completed events", () => {
    setup()
    expect(screen.getByText("History Essay")).toHaveClass("line-through")
    expect(screen.getByText("Math Quiz")).not.toHaveClass("line-through")
  })

  it("explains an empty active list", () => {
    setup({ filteredEvents: [] })
    expect(screen.getByText("No active events match your filters.")).toBeInTheDocument()
  })

  it("explains an empty completed list", () => {
    setup({ filteredEvents: [], eventTab: "completed" })
    expect(screen.getByText("No completed events match your filters.")).toBeInTheDocument()
  })
})

describe("CalendarEventListCard: adding", () => {
  it("adds an event for the selected day from the Add menu", async () => {
    const user = userEvent.setup()
    const { onOpenAddEvent } = setup({ selectedDateKey: "2026-04-16" })

    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(await screen.findByRole("menuitem", { name: "Add Event" }))

    expect(onOpenAddEvent).toHaveBeenCalledWith("2026-04-16")
  })
})
