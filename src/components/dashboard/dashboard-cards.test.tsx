import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CalendarClock } from "lucide-react"

import type { CalendarEvent } from "@/lib/calendar-event"
import type { NotesDirectoryEntry } from "@/lib/notes-model"
import { DashboardStatCard } from "./dashboard-stat-card"
import { NextPriorityCard } from "./next-priority-card"
import { RecentNotesCard } from "./recent-notes-card"
import { UpcomingDeadlinesCard } from "./upcoming-deadlines-card"

const event: CalendarEvent = {
  id: 1,
  title: "Physics Lab",
  date: "2026-04-21",
  time: "9:00 AM",
  color: "Physics",
  status: "incomplete",
}

const note: NotesDirectoryEntry = {
  id: "n1",
  wing: "W",
  flight: "F",
  branch: "Biology",
  nest: "Unit 4",
  feather: "Exam review",
  createdMode: "spatial",
  createdAt: 0,
  updatedAt: Date.now(),
}

describe("DashboardStatCard", () => {
  it("shows the title, value and caption", () => {
    render(<DashboardStatCard title="Due Today" icon={CalendarClock} value={3} caption="Events on today's date" />)
    expect(screen.getByText("Due Today")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("Events on today's date")).toBeInTheDocument()
  })
})

describe("NextPriorityCard", () => {
  it("describes the next event", () => {
    render(<NextPriorityCard event={event} />)
    expect(screen.getByText("Physics Lab on Tue, Apr 21, 2026 at 9:00 AM")).toBeInTheDocument()
  })

  it("says so when nothing is coming up", () => {
    render(<NextPriorityCard event={null} />)
    expect(screen.getByText("No upcoming incomplete events in the next 7 days.")).toBeInTheDocument()
  })
})

describe("UpcomingDeadlinesCard", () => {
  it("lists each event with its date and class, and links to the calendar", () => {
    render(<UpcomingDeadlinesCard events={[event]} />)
    expect(screen.getByText("Physics Lab")).toBeInTheDocument()
    expect(screen.getByText("Tue, Apr 21, 2026 at 9:00 AM")).toBeInTheDocument()
    expect(screen.getByText("Physics")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Review full calendar/ })).toHaveAttribute("href", "/calendar")
  })

  it("explains an empty list", () => {
    render(<UpcomingDeadlinesCard events={[]} />)
    expect(screen.getByText("No upcoming incomplete events in the next week.")).toBeInTheDocument()
  })
})

describe("RecentNotesCard", () => {
  it("shows a loading message first", () => {
    render(<RecentNotesCard notes={[]} isLoading />)
    expect(screen.getByText("Loading saved notes...")).toBeInTheDocument()
  })

  it("lists notes with their location, mode and age, and links to the workspace", () => {
    render(<RecentNotesCard notes={[note]} isLoading={false} />)
    expect(screen.getByText("Biology / Unit 4 / Exam review")).toBeInTheDocument()
    expect(screen.getByText("Spatial note")).toBeInTheDocument()
    expect(screen.getByText("just now")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open notes workspace/ })).toHaveAttribute("href", "/notes")
  })

  it("labels linear notes as such", () => {
    render(<RecentNotesCard notes={[{ ...note, createdMode: "linear" }]} isLoading={false} />)
    expect(screen.getByText("Linear note")).toBeInTheDocument()
  })

  it("explains when nothing has been saved", () => {
    render(<RecentNotesCard notes={[]} isLoading={false} />)
    expect(screen.getByText(/No saved notes yet/)).toBeInTheDocument()
  })
})
