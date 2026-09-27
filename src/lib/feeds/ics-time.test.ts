import { describe, expect, it } from "vitest";

import {
  addDays,
  dateKeyOf,
  daysBetween,
  isKnownTimeZone,
  toDueAt,
  utcToZone,
  weekdayOf,
} from "./ics-time";

describe("date keys", () => {
  it("adds days across months, years and a DST change without drifting", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("names the weekday, Sunday first", () => {
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-09-28")).toBe(1);
  });

  it("reads a local date off a Date", () => {
    expect(dateKeyOf(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("zones", () => {
  it("knows a real zone and refuses a Windows name or nothing", () => {
    expect(isKnownTimeZone("America/New_York")).toBe(true);
    expect(isKnownTimeZone("America/New_York")).toBe(true);
    expect(isKnownTimeZone("Eastern Standard Time")).toBe(false);
    expect(isKnownTimeZone("")).toBe(false);
  });

  it("moves a UTC clock into a zone, and leaves it be for an unknown one", () => {
    expect(utcToZone("2025-03-08", 4 * 60 + 59, "America/New_York")).toEqual({
      date: "2025-03-07",
      minutes: 23 * 60 + 59,
    });
    expect(utcToZone("2025-03-08", 30, "Not/AZone")).toEqual({ date: "2025-03-08", minutes: 30 });
  });
});

describe("toDueAt", () => {
  const zone = "America/New_York";

  it("puts a UTC deadline on this device's clock", () => {
    expect(toDueAt({ kind: "utc", date: "2025-03-07", minutes: 14 * 60 }, null, zone)).toEqual({
      dueDate: "2025-03-07",
      dueMinutes: 9 * 60,
      timeZone: zone,
    });
  });

  it("reads midnight to 23:59 as all day, the way Brightspace writes it", () => {
    expect(
      toDueAt(
        { kind: "utc", date: "2005-02-28", minutes: 5 * 60 },
        { kind: "utc", date: "2005-03-01", minutes: 4 * 60 + 59 },
        zone,
      ),
    ).toEqual({ dueDate: "2005-02-28", dueMinutes: null, timeZone: zone });
  });

  it("reads midnight to the next midnight as all day too", () => {
    expect(
      toDueAt(
        { kind: "zoned", date: "2025-01-01", minutes: 0, timeZone: "" },
        { kind: "zoned", date: "2025-01-02", minutes: 0, timeZone: "" },
        zone,
      ).dueMinutes,
    ).toBeNull();
  });

  it("keeps a midnight start with a real end, or no end, or a date end, as a time", () => {
    const midnight = { kind: "zoned", date: "2025-01-01", minutes: 0, timeZone: "" } as const;

    expect(toDueAt(midnight, null, zone).dueMinutes).toBe(0);
    expect(toDueAt(midnight, { kind: "date", date: "2025-01-02" }, zone).dueMinutes).toBe(0);
    expect(
      toDueAt(midnight, { ...midnight, date: "2025-01-02", minutes: 30 }, zone).dueMinutes,
    ).toBe(0);
  });

  it("keeps a TZID's own wall clock and zone, and reads an unknown zone as this device's", () => {
    expect(
      toDueAt(
        { kind: "zoned", date: "2025-01-27", minutes: 479, timeZone: "Europe/Paris" },
        null,
        zone,
      ),
    ).toEqual({ dueDate: "2025-01-27", dueMinutes: 479, timeZone: "Europe/Paris" });
    expect(
      toDueAt(
        { kind: "zoned", date: "2025-01-27", minutes: 479, timeZone: "Pacific Time" },
        null,
        zone,
      ).timeZone,
    ).toBe(zone);
  });

  it("gives a date-only event no time", () => {
    expect(toDueAt({ kind: "date", date: "2025-01-27" }, null, zone)).toEqual({
      dueDate: "2025-01-27",
      dueMinutes: null,
      timeZone: zone,
    });
  });
});
