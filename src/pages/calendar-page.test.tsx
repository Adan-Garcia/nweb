import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import { createTwigSeries } from "@/lib/twigs/twig-series";
import { createTwig, listTwigs } from "@/lib/twigs/twig-storage";

import { CalendarPage } from "./calendar";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });

  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
});

/** Add stays disabled until the workspace has loaded, because a task needs a branch. */
async function findEnabledAddButton() {
  const button = await screen.findByRole("button", { name: "Add Event" });
  await waitFor(() => expect(button).toBeEnabled());

  return button;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <CalendarPage />
    </MemoryRouter>,
  );
}

describe("CalendarPage", () => {
  it("shows the month grid, the filters and an empty event list", async () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText("No active events match your filters.")).toBeInTheDocument();
  });

  it("links to the calendar feeds, to subscribe to a school calendar", async () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "/settings#feeds",
    );
    await findEnabledAddButton();
  });

  it("keeps Add shut until the branches are there to file a task under", async () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Add Event" })).toBeDisabled();
    await findEnabledAddButton();
  });

  it("adds an event through the form and lists it", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await findEnabledAddButton());
    await user.type(screen.getByLabelText("Title"), "Study group");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    // The event shows in the list and on its day in the grid.
    await waitFor(() => expect(screen.getAllByText("Study group")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Create event" })).not.toBeInTheDocument();
    // It is a twig in IndexedDB now, not a row in localStorage.
    expect(await listTwigs()).toHaveLength(1);
  });

  it("keeps the form open and explains a missing title", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await findEnabledAddButton());
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
  });

  it("deletes an event after confirmation", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;
    const { path } = await ensureDefaultWorkspace();
    await createTwig({
      branchId: path.branch.id,
      title: "Old quiz",
      dueDate: date,
      dueTime: "9:00 AM",
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Old quiz" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => expect(screen.queryByText("Old quiz")).not.toBeInTheDocument());
  });

  it("deletes a repeating event from one occurrence on, or all of it", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const { path } = await ensureDefaultWorkspace();
    await createTwigSeries(
      { branchId: path.branch.id, title: "Reading", dueDate: `${month}-10`, dueTime: "9:00 AM" },
      "daily",
      `${month}-13`,
    );
    const readingDates = async () => (await listTwigs()).map((twig) => twig.dueDate).sort();
    renderPage();

    const deleteButtons = await screen.findAllByRole("button", { name: "Delete Reading" });
    await user.click(deleteButtons[2]);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "This and following" }),
    );
    await waitFor(async () => expect(await readingDates()).toEqual([`${month}-10`, `${month}-11`]));

    await user.click((await screen.findAllByRole("button", { name: "Delete Reading" }))[0]);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "All events" }),
    );
    await waitFor(async () => expect(await readingDates()).toEqual([]));
  });

  it("closes the form with Escape", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await findEnabledAddButton());
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(within(document.body).queryByLabelText("Title")).not.toBeInTheDocument();
  });
});
