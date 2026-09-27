import { describe, expect, it } from "vitest";

import { MAX_ICS_EVENTS, parseIcs, parseIcsTime, unescapeText } from "./ics-parse";

const calendar = (...lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");

describe("parseIcs", () => {
  it("reads events, the calendar's name, and unfolds long lines", () => {
    const parsed = parseIcs(
      calendar(
        "X-WR-CALNAME:All Courses",
        "BEGIN:VEVENT",
        "UID:one@example.edu",
        "SUMMARY:Major Project",
        "LOCATION:EGEN.99.01 - Engineering Co-op Preparation",
        "DESCRIPTION:Please include your name on the cov",
        "\ter page.\\nPlease note the dates!",
        "CATEGORIES:Assignments,Due\\, soon",
        "DTSTART:20250307T140000Z",
        "DTEND:20250307T140000Z",
        "END:VEVENT",
      ),
    );

    expect(parsed.name).toBe("All Courses");
    expect(parsed.events).toEqual([
      {
        uid: "one@example.edu",
        summary: "Major Project",
        description: "Please include your name on the cover page.\nPlease note the dates!",
        location: "EGEN.99.01 - Engineering Co-op Preparation",
        categories: ["Assignments", "Due, soon"],
        start: { kind: "utc", date: "2025-03-07", minutes: 14 * 60 },
        end: { kind: "utc", date: "2025-03-07", minutes: 14 * 60 },
        rrule: null,
        exdates: [],
        recurrenceId: null,
        cancelled: false,
      },
    ]);
  });

  it("keeps a TZID, a floating time, a date, and a repeating rule with its exceptions", () => {
    const [event] = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:series",
        "DTSTART;TZID=America/New_York:20210209T122500",
        "DTEND;VALUE=DATE:20210210",
        "RRULE:FREQ=WEEKLY;BYDAY=TU",
        "EXDATE;TZID=America/New_York:20210216T122500,20210223T122500",
        "STATUS:CONFIRMED",
        "END:VEVENT",
      ),
    ).events;

    expect(event.start).toEqual({
      kind: "zoned",
      date: "2021-02-09",
      minutes: 12 * 60 + 25,
      timeZone: "America/New_York",
    });
    expect(event.end).toEqual({ kind: "date", date: "2021-02-10" });
    expect(event.rrule).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(event.exdates).toEqual(["2021-02-16", "2021-02-23"]);
    expect(event.cancelled).toBe(false);
  });

  it("reads overrides, cancellations and quoted parameters", () => {
    const [event] = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:series",
        'DTSTART;X-LABEL="a:b";TZID=Floating:20210209T090000',
        "RECURRENCE-ID:20210216T090000",
        "STATUS:CANCELLED",
        "DUE:20210209T100000",
        "END:VEVENT",
      ),
    ).events;

    expect(event.start).toMatchObject({ kind: "zoned", minutes: 9 * 60, timeZone: "Floating" });
    expect(event.end).toMatchObject({ kind: "zoned", minutes: 10 * 60, timeZone: "" });
    expect(event.recurrenceId).toBe("2021-02-16");
    expect(event.cancelled).toBe(true);
  });

  it("ignores alarms inside an event, other components, and lines it cannot read", () => {
    const parsed = parseIcs(
      calendar(
        "X-WR-CALNAME:",
        "BEGIN:VTIMEZONE",
        "DTSTART:20110313T030000",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "SUMMARY:Quiz",
        "DTSTART:20250101",
        "not a property",
        ":no name",
        "EXDATE:garbage",
        "BEGIN:VALARM",
        "DESCRIPTION:Reminder",
        "END:VALARM",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:No start",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:not-a-date",
        "END:VEVENT",
      ),
    );

    expect(parsed.name).toBeNull();
    expect(parsed.events).toHaveLength(1);
    // No UID: one is made from what the event says, so it is stable between fetches.
    expect(parsed.events[0]).toMatchObject({
      uid: "2025-01-01:Quiz",
      description: "",
      start: { kind: "date", date: "2025-01-01" },
      exdates: [],
    });
  });

  it("refuses text that is not a calendar", () => {
    expect(() => parseIcs("<html>Sign in</html>")).toThrow("Not an iCalendar file.");
  });

  it("accepts a byte-order mark and bare newlines", () => {
    const parsed = parseIcs(
      "﻿BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20250101\nEND:VEVENT\nEND:VCALENDAR",
    );

    expect(parsed.events).toHaveLength(1);
  });

  it("stops at the event cap", () => {
    const event = ["BEGIN:VEVENT", "DTSTART:20250101", "END:VEVENT"];
    const lines = Array.from({ length: MAX_ICS_EVENTS + 1 }, () => event).flat();

    expect(parseIcs(calendar(...lines)).events).toHaveLength(MAX_ICS_EVENTS);
  });
});

describe("parseIcsTime", () => {
  it("refuses a clock that is not one", () => {
    expect(parseIcsTime("20250101T250000")).toBeNull();
    expect(parseIcsTime("20250101T106000")).toBeNull();
  });
});

describe("unescapeText", () => {
  it("undoes each escape", () => {
    expect(unescapeText("a\\,b\\;c\\\\d\\Ne")).toBe("a,b;c\\d\ne");
  });
});
