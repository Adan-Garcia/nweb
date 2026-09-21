import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { createBranch, createFlight, createWing } from "@/lib/entity-storage";
import { getNotesDb } from "@/lib/notes-db";
import { createTwig } from "@/lib/twig-storage";

import { NotificationBell } from "./notification-bell";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

/** Keys relative to today, so the test never goes stale or depends on a timezone. */
function dayOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

let branchId = "";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));

  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  branchId = (await createBranch({ flightId: flight.id, name: "Biology" })).id;
});

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  it("says nothing is due when nothing is", async () => {
    const user = userEvent.setup();
    renderBell();

    const bell = await screen.findByRole("button", { name: "Notifications, nothing due" });
    await user.click(bell);

    expect(await screen.findByText("Nothing is due in the next week.")).toBeInTheDocument();
  });

  it("counts what is late or due today, and not next week's work", async () => {
    await createTwig({ branchId, title: "Late essay", dueDate: dayOffset(-2) });
    await createTwig({ branchId, title: "Today's lab", dueDate: dayOffset(0) });
    await createTwig({ branchId, title: "Next week", dueDate: dayOffset(5) });

    renderBell();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications, 2 needing attention" }),
      ).toBeInTheDocument(),
    );
  });

  it("lists each item with why it is showing and which branch it is from", async () => {
    const user = userEvent.setup();
    await createTwig({
      branchId,
      title: "Late essay",
      dueDate: dayOffset(-2),
      dueTime: "5:00 PM",
    });
    await createTwig({ branchId, title: "Next week", dueDate: dayOffset(5) });

    renderBell();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(await screen.findByText("Late essay")).toBeInTheDocument();
    expect(screen.getByText(/Overdue .* at 5:00 PM .* Biology/)).toBeInTheDocument();
    expect(screen.getByText(/Due soon .* Biology/)).toBeInTheDocument();
  });

  it("leaves finished and undated tasks out of it", async () => {
    const user = userEvent.setup();
    await createTwig({
      branchId,
      title: "Finished",
      dueDate: dayOffset(-1),
      status: "complete",
    });
    await createTwig({ branchId, title: "Someday" });

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, nothing due" }));

    expect(await screen.findByText("Nothing is due in the next week.")).toBeInTheDocument();
    expect(screen.queryByText("Finished")).not.toBeInTheDocument();
    expect(screen.queryByText("Someday")).not.toBeInTheDocument();
  });

  it("re-reads on open, so a task added elsewhere shows without a reload", async () => {
    const user = userEvent.setup();
    renderBell();

    const bell = await screen.findByRole("button", { name: "Notifications, nothing due" });
    await createTwig({ branchId, title: "Added later", dueDate: dayOffset(0) });
    await user.click(bell);

    expect(await screen.findByText("Added later")).toBeInTheDocument();
  });

  it("offers a way through to the calendar", async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(await screen.findByRole("link", { name: "Open calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
  });
});
