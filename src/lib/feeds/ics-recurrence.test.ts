import { describe, expect, it } from "vitest";

import { MAX_OCCURRENCES, occurrenceDates, parseRule } from "./ics-recurrence";

const HORIZON = "2030-01-01";

describe("parseRule", () => {
  it("reads the parts it knows and falls back on the rest", () => {
    expect(parseRule("FREQ=WEEKLY;INTERVAL=0;COUNT=-1;BYDAY=2MO,XX,-1FR;BYMONTH=13,2")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      count: null,
      until: null,
      byDay: [
        { weekday: 1, ordinal: 2 },
        { weekday: 5, ordinal: -1 },
      ],
      byMonthDay: [],
      byMonth: [2],
    });
  });

  it("refuses a rule with no frequency it knows", () => {
    expect(parseRule("FREQ=HOURLY")).toBeNull();
    expect(parseRule("INTERVAL=2")).toBeNull();
  });
});

describe("occurrenceDates", () => {
  it("steps a weekly rule over its weekdays until UNTIL", () => {
    expect(
      occurrenceDates(
        "2021-02-09",
        "FREQ=WEEKLY;UNTIL=20210216T172500Z;INTERVAL=1;BYDAY=TU",
        HORIZON,
      ),
    ).toEqual(["2021-02-09", "2021-02-16"]);
    expect(occurrenceDates("2026-09-28", "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", HORIZON)).toEqual([
      "2026-09-28",
      "2026-09-30",
      "2026-10-05",
      "2026-10-07",
    ]);
  });

  it("reads UNTIL on the event's own clock, not as a bare UTC date", () => {
    const newYork = { startMinutes: 9 * 60, timeZone: "America/New_York" };

    // Google's "ends at local midnight on Oct 1": 03:59:59 UTC on Oct 2 is still Oct 1 here.
    expect(
      occurrenceDates("2026-09-29", "FREQ=DAILY;UNTIL=20261002T035959Z", HORIZON, newYork),
    ).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    // An end earlier in the day than the event leaves that last day out.
    expect(
      occurrenceDates("2026-09-29", "FREQ=DAILY;UNTIL=20261001T120000Z", HORIZON, newYork),
    ).toEqual(["2026-09-29", "2026-09-30"]);
  });

  it("compares a UTC start with UTC, and a date start by date alone", () => {
    expect(
      occurrenceDates("2026-09-29", "FREQ=DAILY;UNTIL=20261001T080000Z", HORIZON, {
        startMinutes: 9 * 60,
        timeZone: "UTC",
      }),
    ).toEqual(["2026-09-29", "2026-09-30"]);
    expect(occurrenceDates("2026-09-29", "FREQ=DAILY;UNTIL=20261001T000000Z", HORIZON)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(occurrenceDates("2026-09-29", "FREQ=DAILY;UNTIL=20261001", HORIZON)).toHaveLength(3);
  });

  it("uses the start's own weekday when none is given, and honours an interval", () => {
    expect(occurrenceDates("2026-09-28", "FREQ=WEEKLY;INTERVAL=2;COUNT=3", HORIZON)).toEqual([
      "2026-09-28",
      "2026-10-12",
      "2026-10-26",
    ]);
  });

  it("repeats daily up to the horizon", () => {
    expect(occurrenceDates("2029-12-30", "FREQ=DAILY", HORIZON)).toEqual([
      "2029-12-30",
      "2029-12-31",
      "2030-01-01",
    ]);
  });

  it("picks days of the month by number, from the end, and by nth weekday", () => {
    expect(occurrenceDates("2026-01-15", "FREQ=MONTHLY;COUNT=3", HORIZON)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
    expect(occurrenceDates("2026-01-31", "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3", HORIZON)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(occurrenceDates("2026-01-12", "FREQ=MONTHLY;BYDAY=2MO;COUNT=3", HORIZON)).toEqual([
      "2026-01-12",
      "2026-02-09",
      "2026-03-09",
    ]);
    expect(occurrenceDates("2026-01-30", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=2", HORIZON)).toEqual([
      "2026-01-30",
      "2026-02-27",
    ]);
    // A fifth Monday most months do not have is skipped, not invented.
    expect(occurrenceDates("2026-06-29", "FREQ=MONTHLY;BYDAY=5MO;COUNT=2", HORIZON)).toEqual([
      "2026-06-29",
      "2026-08-31",
    ]);
  });

  it("carries a monthly rule across the new year", () => {
    expect(occurrenceDates("2026-11-05", "FREQ=MONTHLY;BYDAY=TH;COUNT=2", HORIZON)).toEqual([
      "2026-11-05",
      "2026-11-12",
    ]);
    expect(occurrenceDates("2026-12-10", "FREQ=MONTHLY;COUNT=2", HORIZON)).toEqual([
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("repeats yearly, in the months it names, and skips a leap day in other years", () => {
    expect(occurrenceDates("2026-03-01", "FREQ=YEARLY;COUNT=2", HORIZON)).toEqual([
      "2026-03-01",
      "2027-03-01",
    ]);
    expect(occurrenceDates("2026-03-01", "FREQ=YEARLY;BYMONTH=9,3;COUNT=3", HORIZON)).toEqual([
      "2026-03-01",
      "2026-09-01",
      "2027-03-01",
    ]);
    expect(occurrenceDates("2024-02-29", "FREQ=YEARLY;COUNT=2", HORIZON)).toEqual([
      "2024-02-29",
      "2028-02-29",
    ]);
  });

  it("gives just the start for a rule it cannot read, and stops at the cap", () => {
    expect(occurrenceDates("2026-01-01", "FREQ=SECONDLY", HORIZON)).toEqual(["2026-01-01"]);
    expect(occurrenceDates("2000-01-01", "FREQ=DAILY", "2099-01-01")).toHaveLength(MAX_OCCURRENCES);
  });
});
