import { describe, expect, it, vi } from "vitest";

import { currentTimeZone, formatDueTime, parseDueTime } from "./due-time";

describe("parseDueTime", () => {
  it("reads the twelve-hour form the app has always written", () => {
    expect(parseDueTime("9:00 AM")).toBe(9 * 60);
    expect(parseDueTime("3:30 PM")).toBe(15 * 60 + 30);
    expect(parseDueTime("11:59 PM")).toBe(23 * 60 + 59);
  });

  it("takes the shapes people actually type", () => {
    expect(parseDueTime("9 AM")).toBe(9 * 60);
    expect(parseDueTime("9am")).toBe(9 * 60);
    expect(parseDueTime("9:05a.m.")).toBe(9 * 60 + 5);
    expect(parseDueTime("  3:30 pm  ")).toBe(15 * 60 + 30);
  });

  it("reads a twenty-four hour time", () => {
    expect(parseDueTime("15:30")).toBe(15 * 60 + 30);
    expect(parseDueTime("00:00")).toBe(0);
    expect(parseDueTime("23:59")).toBe(23 * 60 + 59);
  });

  it("gets noon and midnight right, which is what the twelve-hour clock gets wrong", () => {
    expect(parseDueTime("12:00 AM")).toBe(0);
    expect(parseDueTime("12:00 PM")).toBe(12 * 60);
    expect(parseDueTime("12:30 AM")).toBe(30);
  });

  it("returns null for anything that is not a time", () => {
    expect(parseDueTime("")).toBeNull();
    expect(parseDueTime("after lunch")).toBeNull();
    expect(parseDueTime("25:00")).toBeNull();
    expect(parseDueTime("12:60")).toBeNull();
    expect(parseDueTime("13:00 PM")).toBeNull();
    expect(parseDueTime("0:30 PM")).toBeNull();
    expect(parseDueTime("9:99 AM")).toBeNull();
    expect(parseDueTime("9")).toBeNull();
  });
});

describe("formatDueTime", () => {
  it("round-trips what parseDueTime read", () => {
    for (const text of ["9:00 AM", "3:30 PM", "12:00 AM", "12:00 PM", "11:59 PM"]) {
      expect(formatDueTime(parseDueTime(text)!)).toBe(text);
    }
  });

  it("wraps rather than producing a time that does not exist", () => {
    expect(formatDueTime(0)).toBe("12:00 AM");
    expect(formatDueTime(24 * 60)).toBe("12:00 AM");
    expect(formatDueTime(-30)).toBe("11:30 PM");
  });
});

describe("currentTimeZone", () => {
  it("reports the zone this device is in", () => {
    // The suite pins every run to America/New_York (vitest.global-setup.ts).
    expect(currentTimeZone()).toBe("America/New_York");
  });

  it("falls back to UTC where there is no zone data at all", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("no zone data");
    });

    expect(currentTimeZone()).toBe("UTC");
  });
});
