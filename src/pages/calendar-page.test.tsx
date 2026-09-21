import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "./calendar";

const STORAGE_KEY = "cuervo-calendar-events-v1";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  // Start with an empty calendar rather than the seeded sample events.
  window.localStorage.setItem(STORAGE_KEY, "[]");
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <CalendarPage />
    </MemoryRouter>,
  );
}

describe("CalendarPage", () => {
  it("shows the month grid, the filters and an empty event list", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("No active events match your filters.")).toBeInTheDocument();
  });

  it("adds an event through the form and lists it", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Event" }));
    await user.type(screen.getByLabelText("Title"), "Study group");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    // The event shows in the list and on its day in the grid.
    await waitFor(() => expect(screen.getAllByText("Study group")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Create event" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(1);
  });

  it("keeps the form open and explains a missing title", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Event" }));
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
  });

  it("deletes an event after confirmation", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 1, title: "Old quiz", date, time: "9:00 AM", color: "Math", status: "incomplete" },
      ]),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Old quiz" }));

    expect(screen.queryByText("Old quiz")).not.toBeInTheDocument();
  });

  it("closes the form with Escape", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Event" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(within(document.body).queryByLabelText("Title")).not.toBeInTheDocument();
  });
});
