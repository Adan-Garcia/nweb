import { render as renderElement, screen } from "@testing-library/react";
import { CalendarClock } from "lucide-react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { DatedTwig } from "@/components/calendar/calendar-shared";
import type { NotesDirectoryEntry } from "@/lib/notes/notes-model";
import { makeEntry, makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import { DashboardStatCard } from "./dashboard-stat-card";
import { NextPriorityCard } from "./next-priority-card";
import { RecentNotesCard } from "./recent-notes-card";
import { UpcomingDeadlinesCard } from "./upcoming-deadlines-card";

const snapshot = makeSnapshot();

/** The list cards link with the router's `Link`, so they need one around them. */
const render = (element: ReactElement) => renderElement(<MemoryRouter>{element}</MemoryRouter>);

const event: DatedTwig = {
  ...makeTwig({ id: "1", title: "Physics Lab", dueTime: "9:00 AM" }),
  dueDate: "2026-04-21",
};

const note: NotesDirectoryEntry = makeEntry({
  id: "n1",
  createdMode: "spatial",
  updatedAt: Date.now(),
});

describe("DashboardStatCard", () => {
  it("shows the title, value and caption", () => {
    render(
      <DashboardStatCard
        title="Due Today"
        icon={CalendarClock}
        value={3}
        caption="Events on today's date"
      />,
    );
    expect(screen.getByText("Due Today")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Events on today's date")).toBeInTheDocument();
  });
});

describe("NextPriorityCard", () => {
  it("describes the next event", () => {
    render(<NextPriorityCard event={event} />);
    expect(screen.getByText("Physics Lab on Tue, Apr 21, 2026 at 9:00 AM")).toBeInTheDocument();
  });

  it("says so when nothing is coming up", () => {
    render(<NextPriorityCard event={null} />);
    expect(
      screen.getByText("No upcoming incomplete events in the next 7 days."),
    ).toBeInTheDocument();
  });
});

describe("UpcomingDeadlinesCard", () => {
  it("lists each event with its date and class, and links to the calendar", () => {
    render(<UpcomingDeadlinesCard snapshot={snapshot} events={[event]} />);
    expect(screen.getByText("Physics Lab")).toBeInTheDocument();
    expect(screen.getByText("Tue, Apr 21, 2026 at 9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review full calendar/ })).toHaveAttribute(
      "href",
      "/calendar",
    );
  });

  it("gives an all-day event a date and no dangling time", () => {
    render(<UpcomingDeadlinesCard snapshot={snapshot} events={[{ ...event, dueTime: "" }]} />);
    expect(screen.getByText("Tue, Apr 21, 2026")).toBeInTheDocument();
  });

  it("explains an empty list", () => {
    render(<UpcomingDeadlinesCard snapshot={snapshot} events={[]} />);
    expect(screen.getByText("No upcoming incomplete events in the next week.")).toBeInTheDocument();
  });
});

describe("RecentNotesCard", () => {
  it("shows a loading message first", () => {
    render(<RecentNotesCard snapshot={snapshot} notes={[]} isLoading />);
    expect(screen.getByText("Loading saved notes...")).toBeInTheDocument();
  });

  it("lists notes with their location, mode and age, and links to the workspace", () => {
    render(<RecentNotesCard snapshot={snapshot} notes={[note]} isLoading={false} />);
    expect(screen.getByText("Biology 101 / Exam review")).toBeInTheDocument();
    expect(screen.getByText("Spatial note")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open notes workspace/ })).toHaveAttribute(
      "href",
      "/notes",
    );
  });

  it("labels linear notes as such", () => {
    render(
      <RecentNotesCard
        snapshot={snapshot}
        notes={[{ ...note, createdMode: "linear" }]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Linear note")).toBeInTheDocument();
  });

  it("explains when nothing has been saved", () => {
    render(<RecentNotesCard snapshot={snapshot} notes={[]} isLoading={false} />);
    expect(screen.getByText(/No saved notes yet/)).toBeInTheDocument();
  });
});
