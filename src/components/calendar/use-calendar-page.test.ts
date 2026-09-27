import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { createBranch, createFlight, createWing } from "@/lib/hierarchy/entity-storage";
import { dayId } from "@/lib/twigs/calendar-drop";
import type { Twig } from "@/lib/twigs/twig-model";
import { createTwig, listTwigs, type TwigDraft } from "@/lib/twigs/twig-storage";

import { formatDateKey } from "./calendar-shared";
import { useCalendarPage } from "./use-calendar-page";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

// Mid-month dates in the current month keep the tests independent of "today" and the timezone.
const now = new Date();
const monthKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 15)).slice(0, 8);

let mathId = "";
let physicsId = "";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));

  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  mathId = (await createBranch({ flightId: flight.id, name: "Math" })).id;
  physicsId = (await createBranch({ flightId: flight.id, name: "Physics" })).id;
});

function twigOn(day: string, overrides: Partial<TwigDraft> = {}) {
  return createTwig({
    branchId: mathId,
    title: "Event",
    dueDate: `${monthKey}${day}`,
    dueTime: "9:00 AM",
    ...overrides,
  });
}

async function mount() {
  const hook = renderHook(() => useCalendarPage());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe("useCalendarPage", () => {
  it("shows this month's active tasks by default, and leaves undated ones off", async () => {
    const shown = await twigOn("15", { title: "Shown" });
    await twigOn("16", { title: "Done", status: "complete" });
    await twigOn("15", { title: "Ancient", dueDate: "1999-01-15" });
    await createTwig({ branchId: mathId, title: "Someday" });

    const { result } = await mount();

    expect(result.current.viewMode).toBe("month");
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([shown.id]);
    expect(result.current.visibleDates.length % 7).toBe(0);
  });

  it("switches between the active and completed tabs", async () => {
    await twigOn("15", { title: "Active" });
    const done = await twigOn("16", { title: "Done", status: "complete" });
    const { result } = await mount();

    act(() => result.current.setEventTab("completed"));

    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([done.id]);
  });

  it("filters by search text and branch, listing the branches in view", async () => {
    const algebra = await twigOn("15", { title: "Algebra" });
    const optics = await twigOn("16", { title: "Optics", branchId: physicsId });
    const { result } = await mount();

    expect(result.current.eventClasses.map((branch) => branch.label)).toEqual([
      "Fall 2026 / Math",
      "Fall 2026 / Physics",
    ]);

    act(() => result.current.setSearchTerm("optic"));
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([optics.id]);

    act(() => {
      result.current.setSearchTerm("");
      result.current.setSelectedClassFilter(mathId);
    });
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([algebra.id]);
  });

  it("selecting a date narrows the list to that day, and clearing it restores the list", async () => {
    const first = await twigOn("15");
    const second = await twigOn("16");
    const { result } = await mount();
    const day = new Date(now.getFullYear(), now.getMonth(), 16);

    act(() => result.current.selectDate(day));
    expect(result.current.selectedDateKey).toBe(`${monthKey}16`);
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([second.id]);

    act(() => result.current.clearDayFilter());
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it("moves the month forward and back, and returns to today", async () => {
    const { result } = await mount();
    const start = result.current.monthLabel;

    act(() => result.current.goNext());
    expect(result.current.monthLabel).not.toBe(start);
    act(() => result.current.goPrevious());
    expect(result.current.monthLabel).toBe(start);

    act(() => result.current.goNext());
    act(() => result.current.goToToday());
    expect(result.current.monthLabel).toBe(start);
    expect(result.current.selectedDateKey).toBeNull();
  });

  it("moves by whole weeks in week view and keeps the month in sync", async () => {
    const { result } = await mount();

    act(() => result.current.setViewMode("week"));
    const firstWeek = result.current.weekLabel;
    expect(result.current.visibleDates).toHaveLength(7);

    act(() => result.current.goNext());
    const nextWeek = result.current.visibleDates[0];
    expect(result.current.weekLabel).not.toBe(firstWeek);

    act(() => result.current.goPrevious());
    expect(result.current.weekLabel).toBe(firstWeek);
    expect(nextWeek.getDay()).toBe(0);
  });

  it("opens the editor to add on the selected day, defaulting to the first branch", async () => {
    const { result } = await mount();
    const day = new Date(now.getFullYear(), now.getMonth(), 16);

    act(() => result.current.selectDate(day));
    act(() => result.current.editor.openAdd());

    expect(result.current.editor.isOpen).toBe(true);
    expect(result.current.editor.editingTwigId).toBeNull();
    expect(result.current.editor.form.getValues("date")).toBe(`${monthKey}16`);
    expect(result.current.editor.form.getValues("branchId")).toBe(mathId);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.editor.isOpen).toBe(false);
  });

  it("opens the editor pre-filled to edit a task", async () => {
    const existing = await twigOn("15", {
      title: "Lab report",
      branchId: physicsId,
      kind: "project",
      status: "inprogress",
    });
    const { result } = await mount();

    act(() => result.current.editor.openEdit(existing));

    expect(result.current.editor.isOpen).toBe(true);
    expect(result.current.editor.editingTwigId).toBe(existing.id);
    expect(result.current.editor.form.getValues()).toEqual({
      title: "Lab report",
      date: existing.dueDate,
      time: "9:00 AM",
      branchId: physicsId,
      kind: "project",
      status: "inprogress",
      repeat: "none",
      repeatUntil: "",
    });
  });

  it("saving a new task adds it, selects its day, and closes the editor", async () => {
    const { result } = await mount();
    const date = `${monthKey}20`;

    act(() => result.current.editor.openAdd(date));
    await act(async () => {
      await result.current.editor.submit({
        title: " Review ",
        date,
        time: "1:00 PM",
        branchId: physicsId,
        kind: "essay",
        status: "incomplete",
        repeat: "none",
        repeatUntil: "",
      });
    });

    expect(result.current.editor.isOpen).toBe(false);
    expect(result.current.selectedDateKey).toBe(date);
    expect(result.current.filteredEvents).toHaveLength(1);
    expect(result.current.filteredEvents[0]).toMatchObject({
      title: "Review",
      dueDate: date,
      dueTime: "1:00 PM",
      branchId: physicsId,
      kind: "essay",
    });
  });

  it("dragging a task onto another day moves its due date there", async () => {
    const twig = await twigOn("15");
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDayDrop(twig.id, dayId(`${monthKey}22`));
    });

    const stored = (await listTwigs()).find((item) => item.id === twig.id);
    expect(stored?.dueDate).toBe(`${monthKey}22`);
    // The view follows the task, so it is still on screen after the move.
    expect(result.current.selectedDateKey).toBe(`${monthKey}22`);
  });

  it("ignores a drop on nothing, on a non-day, or back on the same day", async () => {
    const twig = await twigOn("15");
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDayDrop(twig.id, null);
      await result.current.handleDayDrop(twig.id, "column:incomplete");
      await result.current.handleDayDrop(twig.id, dayId(`${monthKey}15`));
    });

    const stored = (await listTwigs()).find((item) => item.id === twig.id);
    expect(stored?.dueDate).toBe(`${monthKey}15`);
    expect(stored?.updatedAt).toBe(twig.updatedAt);
    expect(result.current.selectedDateKey).toBeNull();
  });

  it("saving while editing updates that task instead of adding one", async () => {
    const existing: Twig = await twigOn("15", { title: "Old title" });
    const { result } = await mount();

    act(() => result.current.editor.openEdit(existing));
    await act(async () => {
      await result.current.editor.submit({
        title: "New title",
        date: existing.dueDate ?? "",
        time: existing.dueTime,
        branchId: existing.branchId,
        kind: existing.kind,
        status: existing.status,
        repeat: "none",
        repeatUntil: "",
      });
    });

    expect(result.current.filteredEvents.map((item) => item.title)).toEqual(["New title"]);
  });
});
