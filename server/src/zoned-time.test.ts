// @vitest-environment node
import { describe, expect, it } from "vitest";

import { zonedInstant } from "./zoned-time";

/** The same wall clock, read back in the zone it was meant for. */
function wallClockIn(instant: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
}

describe("zonedInstant", () => {
  it("resolves a plain winter morning", () => {
    const instant = zonedInstant("2026-01-15", 9 * 60, "America/New_York")!;

    // 09:00 in New York in January is 14:00 UTC.
    expect(new Date(instant).toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("resolves the same wall clock differently in summer, which is the point", () => {
    const winter = zonedInstant("2026-01-15", 9 * 60, "America/New_York")!;
    const summer = zonedInstant("2026-07-15", 9 * 60, "America/New_York")!;

    expect(new Date(winter).toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(new Date(summer).toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("agrees with the zone it was asked about, whatever the zone", () => {
    for (const timeZone of ["America/New_York", "Europe/London", "Asia/Tokyo", "UTC"]) {
      const instant = zonedInstant("2026-03-10", 15 * 60 + 30, timeZone)!;

      expect(wallClockIn(instant, timeZone)).toBe("10/03/2026, 15:30");
    }
  });

  it("lands on one of the two instants an hour that repeats could mean", () => {
    // 01:30 on the morning the clocks go back in New York happens twice.
    const instant = zonedInstant("2026-11-01", 90, "America/New_York")!;

    expect(wallClockIn(instant, "America/New_York")).toBe("01/11/2026, 01:30");
  });

  it("does not return nonsense for an hour that is skipped", () => {
    // 02:30 on the morning the clocks go forward in New York does not exist.
    const instant = zonedInstant("2026-03-08", 150, "America/New_York")!;

    // Whatever it resolves to, it is a real instant near the gap rather than nonsense.
    expect(Number.isFinite(instant)).toBe(true);
    expect(Math.abs(instant - Date.UTC(2026, 2, 8, 7, 30))).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("handles midnight and the last minute of a day", () => {
    expect(new Date(zonedInstant("2026-06-01", 0, "UTC")!).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(new Date(zonedInstant("2026-06-01", 1439, "UTC")!).toISOString()).toBe(
      "2026-06-01T23:59:00.000Z",
    );
  });

  it("refuses what is not a date, a minute of a day, or a zone it knows", () => {
    expect(zonedInstant("not a date", 0, "UTC")).toBeNull();
    expect(zonedInstant("2026-06-01", -1, "UTC")).toBeNull();
    expect(zonedInstant("2026-06-01", 1440, "UTC")).toBeNull();
    expect(zonedInstant("2026-06-01", 0, "Mars/Olympus_Mons")).toBeNull();
  });
});
