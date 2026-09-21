import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBranch, createFlight, createWing } from "@/lib/entity-storage";
import { getNotesDb } from "@/lib/notes-db";
import { createTwig, listTwigs } from "@/lib/twig-storage";

import { BoardPage } from "./board";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

let branchId = "";

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });

  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));

  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  branchId = (await createBranch({ flightId: flight.id, name: "Biology" })).id;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/board"]}>
      <BoardPage />
    </MemoryRouter>,
  );
}

/** The order of card titles inside one column, top to bottom. */
function columnTitles(label: string) {
  return within(screen.getByRole("list", { name: label }))
    .queryAllByRole("button", { name: /^Reorder / })
    .map((grip) => grip.getAttribute("aria-label")?.replace("Reorder ", ""));
}

/**
 * dnd-kit's pointer sensor needs a real layout, which jsdom has none of, so these drive the
 * keyboard sensor instead: Space picks a card up, the arrows move it, Space drops it. That
 * is also the path a keyboard user takes, so it is the one worth covering here.
 *
 * Moving between columns needs measured rects that jsdom cannot give either, so that half
 * is covered against the hook in use-board.test.ts.
 */
async function keyboardDrag(user: ReturnType<typeof userEvent.setup>, title: string, keys: string) {
  await user.click(screen.getByRole("button", { name: `Reorder ${title}` }));
  await user.keyboard(`{ }${keys}{ }`);
}

describe("BoardPage", () => {
  it("shows a column per status with its count, and says which are empty", async () => {
    await createTwig({ branchId, title: "Read chapter 4" });

    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
    for (const label of ["Todo", "Started", "Done"]) {
      expect(screen.getByRole("list", { name: label })).toBeInTheDocument();
    }
    await waitFor(() => expect(columnTitles("Todo")).toEqual(["Read chapter 4"]));
    expect(within(screen.getByRole("list", { name: "Done" })).getByText("Nothing here yet."));
  });

  it("lists undated tasks too, because a board is not a calendar", async () => {
    await createTwig({ branchId, title: "Someday" });

    renderPage();

    expect(await screen.findByText(/Biology . Homework . No date/)).toBeInTheDocument();
  });

  it("reorders a card inside its column and keeps it there", async () => {
    const user = userEvent.setup();
    await createTwig({ branchId, title: "First" });
    await createTwig({ branchId, title: "Second" });

    renderPage();
    await waitFor(() => expect(columnTitles("Todo")).toEqual(["First", "Second"]));

    await keyboardDrag(user, "First", "{ArrowDown}");

    await waitFor(() => expect(columnTitles("Todo")).toEqual(["Second", "First"]));

    // And it is the store that says so, not just the screen.
    await waitFor(async () => {
      expect((await listTwigs()).map((twig) => twig.title)).toEqual(["Second", "First"]);
    });
  });

  it("adds a task through the same form the calendar uses", async () => {
    const user = userEvent.setup();
    renderPage();

    const addButton = await screen.findByRole("button", { name: "Add Task" });
    await waitFor(() => expect(addButton).toBeEnabled());
    await user.click(addButton);

    await user.type(screen.getByLabelText("Title"), "Essay outline");
    await user.selectOptions(screen.getByLabelText("Type"), "essay");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(columnTitles("Todo")).toEqual(["Essay outline"]));
    expect(await screen.findByText(/Biology . Essay/)).toBeInTheDocument();
  });

  it("edits a card in place", async () => {
    const user = userEvent.setup();
    await createTwig({ branchId, title: "Old name" });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Old name" }));

    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "New name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(columnTitles("Todo")).toEqual(["New name"]));
  });

  it("deletes a card only after it is confirmed", async () => {
    const user = userEvent.setup();
    await createTwig({ branchId, title: "Doomed" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Delete Doomed" }));

    expect(confirm).toHaveBeenCalledWith('Delete "Doomed"?');
    expect(columnTitles("Todo")).toEqual(["Doomed"]);

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete Doomed" }));

    await waitFor(() => expect(columnTitles("Todo")).toEqual([]));
  });
});
