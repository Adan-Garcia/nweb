import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/notes-db";
import { createTwig } from "@/lib/twig-storage";
import { ensureDefaultWorkspace } from "@/lib/workspace-storage";
import { usePreferencesStore } from "@/stores/use-preferences-store";

import { DashboardPage } from "./dashboard";

const STORES = ["twigs", "notes-directory", "wings", "flights", "branches", "nests"] as const;

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });

  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
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
    const { path } = await ensureDefaultWorkspace();
    await createTwig({
      branchId: path.branch.id,
      title: "Submit essay",
      kind: "essay",
      dueDate: key,
      dueTime: "5:00 PM",
    });
    renderPage();

    expect((await screen.findAllByText(/Submit essay/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Submit essay on .* at 5:00 PM/)).toBeInTheDocument();
  });

  it("shows the cards someone chose, in their order", async () => {
    usePreferencesStore.getState().update({
      dashboardCards: [
        { id: "recent-notes", visible: true },
        { id: "next-priority", visible: false },
        { id: "stats", visible: false },
        { id: "upcoming", visible: true },
      ],
    });
    renderPage();

    expect(await screen.findByText(/No saved notes yet/)).toBeInTheDocument();
    expect(screen.queryByText("Due Today")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next priority" })).not.toBeInTheDocument();

    const recent = screen.getByText("Recent Notes");
    const upcoming = screen.getByText("Upcoming Deadlines");
    expect(
      recent.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("greets by the time of day", () => {
    renderPage();

    expect(screen.getByText(/^Good (morning|afternoon|evening) · /)).toBeInTheDocument();
  });
});
