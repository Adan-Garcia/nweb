import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./dashboard";

const STORAGE_KEY = "cuervo-calendar-events-v1";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  it("summarizes an empty workspace", async () => {
    window.localStorage.setItem(STORAGE_KEY, "[]");
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByText("No upcoming incomplete events in the next 7 days."),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading saved notes...")).toBeInTheDocument();
    expect(await screen.findByText(/No saved notes yet/)).toBeInTheDocument();
    for (const title of ["Due Today", "Upcoming (7 days)", "Overdue", "Notes Updated"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("features the next event as the priority", async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 1,
          title: "Submit essay",
          date: key,
          time: "5:00 PM",
          color: "History",
          status: "incomplete",
        },
      ]),
    );
    renderPage();

    expect((await screen.findAllByText(/Submit essay/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Submit essay on .* at 5:00 PM/)).toBeInTheDocument();
  });
});
