import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/calendar-event";
import { formatDateKey } from "./calendar-shared";
import { useCalendarPage } from "./use-calendar-page";

const STORAGE_KEY = "cuervo-calendar-events-v1";

// Mid-month dates in the current month keep the tests independent of "today" and the timezone.
function seed(events: CalendarEvent[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

const now = new Date();
const monthKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 15)).slice(0, 8);

function eventOn(day: string, overrides: Partial<CalendarEvent> & { id: number }): CalendarEvent {
  return {
    title: `Event ${overrides.id}`,
    date: `${monthKey}${day}`,
    time: "9:00 AM",
    color: "Math",
    status: "incomplete",
    ...overrides,
  };
}

describe("useCalendarPage", () => {
  it("shows this month's active events by default", () => {
    seed([
      eventOn("15", { id: 1 }),
      eventOn("16", { id: 2, status: "complete" }),
      { ...eventOn("15", { id: 3 }), date: "1999-01-15" },
    ]);
    const { result } = renderHook(() => useCalendarPage());

    expect(result.current.viewMode).toBe("month");
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([1]);
    expect(result.current.visibleDates.length % 7).toBe(0);
  });

  it("switches between the active and completed tabs", () => {
    seed([eventOn("15", { id: 1 }), eventOn("16", { id: 2, status: "complete" })]);
    const { result } = renderHook(() => useCalendarPage());

    act(() => result.current.setEventTab("completed"));

    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([2]);
  });

  it("filters by search text and class, and lists the classes in view", () => {
    seed([
      eventOn("15", { id: 1, title: "Algebra", color: "Math" }),
      eventOn("16", { id: 2, title: "Optics", color: "Physics" }),
    ]);
    const { result } = renderHook(() => useCalendarPage());
    expect(result.current.eventClasses).toEqual(["Math", "Physics"]);

    act(() => result.current.setSearchTerm("optic"));
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([2]);

    act(() => {
      result.current.setSearchTerm("");
      result.current.setSelectedClassFilter("Math");
    });
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([1]);
  });

  it("selecting a date narrows the list to that day, and clearing it restores the list", () => {
    seed([eventOn("15", { id: 1 }), eventOn("16", { id: 2 })]);
    const { result } = renderHook(() => useCalendarPage());
    const day = new Date(now.getFullYear(), now.getMonth(), 16);

    act(() => result.current.selectDate(day));
    expect(result.current.selectedDateKey).toBe(`${monthKey}16`);
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([2]);

    act(() => result.current.clearDayFilter());
    expect(result.current.filteredEvents.map((item) => item.id)).toEqual([1, 2]);
  });

  it("moves the month forward and back, and returns to today", () => {
    seed([]);
    const { result } = renderHook(() => useCalendarPage());
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

  it("moves by whole weeks in week view and keeps the month in sync", () => {
    seed([]);
    const { result } = renderHook(() => useCalendarPage());

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

  it("opens the editor to add on the selected day, and closes on Escape", () => {
    seed([]);
    const { result } = renderHook(() => useCalendarPage());
    const day = new Date(now.getFullYear(), now.getMonth(), 16);

    act(() => result.current.selectDate(day));
    act(() => result.current.editor.openAdd());
    expect(result.current.editor.isOpen).toBe(true);
    expect(result.current.editor.editingEventId).toBeNull();
    expect(result.current.editor.form.getValues("date")).toBe(`${monthKey}16`);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.editor.isOpen).toBe(false);
  });

  it("opens the editor pre-filled to edit an event", () => {
    const existing = eventOn("15", {
      id: 7,
      title: "Lab report",
      color: "Chemistry",
      status: "inprogress",
    });
    seed([existing]);
    const { result } = renderHook(() => useCalendarPage());

    act(() => result.current.editor.openEdit(existing));

    expect(result.current.editor.isOpen).toBe(true);
    expect(result.current.editor.editingEventId).toBe(7);
    expect(result.current.editor.form.getValues()).toEqual({
      title: "Lab report",
      date: existing.date,
      time: "9:00 AM",
      color: "Chemistry",
      status: "inprogress",
    });
  });

  it("saving a new event adds it, selects its day, and closes the editor", () => {
    seed([]);
    const { result } = renderHook(() => useCalendarPage());
    const date = `${monthKey}20`;

    act(() => result.current.editor.openAdd(date));
    act(() =>
      result.current.editor.submit({
        title: " Review ",
        date,
        time: "1:00 PM",
        color: "History",
        status: "incomplete",
      }),
    );

    expect(result.current.editor.isOpen).toBe(false);
    expect(result.current.selectedDateKey).toBe(date);
    expect(result.current.filteredEvents).toEqual([
      { id: 1, title: "Review", date, time: "1:00 PM", color: "History", status: "incomplete" },
    ]);
  });

  it("saving while editing updates that event instead of adding one", () => {
    const existing = eventOn("15", { id: 7, title: "Old title" });
    seed([existing]);
    const { result } = renderHook(() => useCalendarPage());

    act(() => result.current.editor.openEdit(existing));
    act(() =>
      result.current.editor.submit({
        title: "New title",
        date: existing.date,
        time: existing.time,
        color: existing.color,
        status: existing.status,
      }),
    );

    expect(result.current.filteredEvents.map((item) => item.title)).toEqual(["New title"]);
  });
});
