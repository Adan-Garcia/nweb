import { afterEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "./calendar-event";
import { loadCalendarEvents, saveCalendarEvents } from "./calendar-storage";

const STORAGE_KEY = "cuervo-calendar-events-v1";

const fallback: CalendarEvent[] = [
  {
    id: 99,
    title: "Fallback",
    date: "2026-01-01",
    time: "9:00 AM",
    color: "Math",
    status: "incomplete",
  },
];
const stored: CalendarEvent = {
  id: 1,
  title: "Stored",
  date: "2026-04-16",
  time: "3:30 PM",
  color: "Physics",
  status: "complete",
};

describe("loadCalendarEvents", () => {
  it("returns the fallback when nothing is stored", () => {
    expect(loadCalendarEvents(fallback)).toBe(fallback);
  });

  it("returns the fallback when the stored value is not valid JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadCalendarEvents(fallback)).toBe(fallback);
  });

  it("returns the fallback when the stored value is not an array", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 1 }));
    expect(loadCalendarEvents(fallback)).toBe(fallback);
  });

  it("keeps valid events and drops malformed ones", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([stored, { ...stored, id: 2, color: "Art" }, null, "junk"]),
    );
    expect(loadCalendarEvents(fallback)).toEqual([stored]);
  });

  it("round-trips events written by saveCalendarEvents", () => {
    saveCalendarEvents([stored]);
    expect(loadCalendarEvents(fallback)).toEqual([stored]);
  });
});

describe("without a window (server rendering)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the fallback and does not try to save", () => {
    vi.stubGlobal("window", undefined);

    expect(loadCalendarEvents(fallback)).toBe(fallback);
    expect(() => saveCalendarEvents([stored])).not.toThrow();
  });
});
