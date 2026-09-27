import { describe, expect, it } from "vitest";

import { expandEvents } from "./ics-occurrences";
import type { IcsEvent } from "./ics-parse";

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

  it("expands each kind of start on its own clock", () => {
    const until = "FREQ=DAILY;UNTIL=20210211T030000Z";
    const keys = (start: IcsEvent["start"]) =>
      expandEvents([makeEvent({ start, end: null, rrule: until })], HORIZON).map(
        (occurrence) => occurrence.start.date,
      );

    // 03:00 UTC on the 11th is 22:00 on the 10th in New York, after a 12:25 start.
    expect(
      keys({ kind: "zoned", date: "2021-02-09", minutes: 745, timeZone: "America/New_York" }),
    ).toEqual(["2021-02-09", "2021-02-10"]);
    // A floating time is this device's clock, which the tests pin to New York.
    expect(keys({ kind: "zoned", date: "2021-02-09", minutes: 745, timeZone: "" })).toEqual([
      "2021-02-09",
      "2021-02-10",
    ]);
    expect(keys({ kind: "utc", date: "2021-02-09", minutes: 60 })).toEqual([
      "2021-02-09",
      "2021-02-10",
      "2021-02-11",
    ]);
    expect(keys({ kind: "date", date: "2021-02-09" })).toEqual([
      "2021-02-09",
      "2021-02-10",
      "2021-02-11",
    ]);
  });

  it("drops a cancelled series outright", () => {
    expect(expandEvents([makeEvent({ rrule: "FREQ=DAILY", cancelled: true })], HORIZON)).toEqual(
      [],
    );
  });
});
