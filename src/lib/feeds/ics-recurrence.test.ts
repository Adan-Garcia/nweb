import { describe, expect, it } from "vitest";

import type { IcsEvent } from "./ics-parse";
import { expandEvents, MAX_OCCURRENCES, occurrenceDates, parseRule } from "./ics-recurrence";

const HORIZON = "2030-01-01";

function makeEvent(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "series",
    summary: "Lecture",
    description: "",
    location: "",
    categories: [],
    start: { kind: "zoned", date: "2021-02-09", minutes: 745, timeZone: "America/New_York" },
    end: { kind: "zoned", date: "2021-02-09", minutes: 835, timeZone: "America/New_York" },
    rrule: null,
    exdates: [],
    recurrenceId: null,
    cancelled: false,
    ...overrides,
  };
}

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

describe("expandEvents", () => {
  it("gives a one-off event one occurrence, keyed by its UID, and drops a cancelled one", () => {
    const event = makeEvent();

    expect(expandEvents([event, makeEvent({ uid: "gone", cancelled: true })], HORIZON)).toEqual([
      { key: "series", event, start: event.start, end: event.end },
    ]);
  });

  it("expands a series, skipping EXDATEs and putting overrides in place", () => {
    const series = makeEvent({
      rrule: "FREQ=WEEKLY;COUNT=4",
      exdates: ["2021-02-16"],
    });
    const moved = makeEvent({
      summary: "Moved lecture",
      recurrenceId: "2021-02-23",
      start: { kind: "zoned", date: "2021-02-24", minutes: 600, timeZone: "America/New_York" },
      end: null,
    });
    const cancelled = makeEvent({ recurrenceId: "2021-03-02", cancelled: true });

    const occurrences = expandEvents([series, moved, cancelled], HORIZON);

    expect(occurrences.map((occurrence) => occurrence.key)).toEqual([
      "series#2021-02-09",
      "series#2021-02-23",
    ]);
    expect(occurrences[1]).toMatchObject({ event: moved, start: moved.start, end: null });
  });

  it("shifts a series' end with its start, and keeps a missing end missing", () => {
    const [, second] = expandEvents(
      [
        makeEvent({ rrule: "FREQ=DAILY;COUNT=2" }),
        makeEvent({ uid: "open", rrule: "FREQ=DAILY;COUNT=2", end: null }),
      ],
      HORIZON,
    );

    expect(second.start.date).toBe("2021-02-10");
    expect(second.end?.date).toBe("2021-02-10");
    expect(
      expandEvents([makeEvent({ uid: "open", rrule: "FREQ=DAILY;COUNT=2", end: null })], HORIZON)[1]
        .end,
    ).toBeNull();
  });

  it("keeps an override whose series is not in the file, unless it was cancelled", () => {
    const orphan = makeEvent({ uid: "orphan", recurrenceId: "2021-02-09" });

    expect(
      expandEvents(
        [orphan, makeEvent({ uid: "x", recurrenceId: "2021-02-09", cancelled: true })],
        HORIZON,
      ),
    ).toEqual([{ key: "orphan#2021-02-09", event: orphan, start: orphan.start, end: orphan.end }]);
  });

  it("drops a cancelled series outright", () => {
    expect(expandEvents([makeEvent({ rrule: "FREQ=DAILY", cancelled: true })], HORIZON)).toEqual(
      [],
    );
  });
});
