import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { listBranches, listFlights } from "@/lib/hierarchy/entity-storage";
import { cachedTheme, chooseTheme } from "@/test/theme";

import { OnboardingPage } from "./onboarding";

const STORES = ["wings", "flights", "branches", "nests", "feeds", "account"] as const;

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
});

function renderPage() {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={["/auth/onboarding"]}>
      <Routes>
        <Route path="/auth/onboarding" element={<OnboardingPage />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );

  return user;
}

const step = (title: string) => screen.findByRole("heading", { name: title });
const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Continue/ }));

describe("OnboardingPage", () => {
  it("starts with the welcome, and moves forward, back, and to a step picked from the list", async () => {
    const user = renderPage();

    expect(await step("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await next(user);
    expect(await step("Your term and courses")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await step("Welcome")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Make it yours/ }));
    expect(await step("Make it yours")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 5")).toBeInTheDocument();
  });

  it("names the term and turns the placeholder course into the first one typed", async () => {
    const user = renderPage();
    await next(user);

    const term = await screen.findByLabelText("This term");
    await user.clear(term);
    await user.type(term, "Fall 2026");
    // The placeholder course starts blank rather than saying "General".
    expect(screen.getByLabelText("Course 1")).toHaveValue("");
    await user.type(screen.getByLabelText("Course 1"), "MECE 110 Thermodynamics");
    await user.click(screen.getByRole("button", { name: "Add another course" }));
    await user.type(screen.getByLabelText("Course 2"), "MECE 203 Strength of Materials");
    await user.click(screen.getByRole("button", { name: "Add another course" }));
    await user.click(screen.getByRole("button", { name: "Remove course 3" }));
    await next(user);

    expect(await step("Bring in your calendar")).toBeInTheDocument();
    expect((await listFlights()).map((flight) => flight.name)).toEqual(["Fall 2026"]);
    expect((await listBranches()).map((branch) => branch.name).sort()).toEqual([
      "MECE 110 Thermodynamics",
      "MECE 203 Strength of Materials",
    ]);
  });

  it("will not save a term with no name, and skipping saves nothing", async () => {
    const user = renderPage();
    await next(user);

    await user.clear(await screen.findByLabelText("This term"));
    await user.type(screen.getByLabelText("Course 1"), "Chemistry");
    await next(user);

    expect(await screen.findByText("Name the term")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your term and courses" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(await step("Bring in your calendar")).toBeInTheDocument();
    expect((await listBranches()).map((branch) => branch.name)).toEqual(["General"]);
  });

  it("offers the calendar, appearance and sync settings, then goes to the dashboard", async () => {
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: /Bring in your calendar/ }));
    await user.click(await screen.findByRole("button", { name: /Add a calendar/i }));
    // The same editor Settings opens, over the step.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await next(user);
    await chooseTheme(user, "Dark");
    expect(cachedTheme()).toBe("dark");

    await next(user);
    expect(await step("Sync and reminders")).toBeInTheDocument();
    expect(await screen.findByText("Reminders")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Go to the dashboard/ }));
    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
  });
});
