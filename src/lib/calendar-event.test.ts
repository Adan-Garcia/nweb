import { describe, expect, it } from "vitest";

import { EVENT_COLOR_OPTIONS, EVENT_STATUS_OPTIONS, calendarEventSchema } from "./calendar-event";

const validEvent = {
  id: 1,
  title: "Math Study Session",
  date: "2026-04-16",
  time: "3:30 PM",
  color: "Math",
  status: "incomplete",
};

describe("calendarEventSchema", () => {
  it("accepts a well-formed event", () => {
    expect(calendarEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it.each(EVENT_COLOR_OPTIONS)("accepts the %s colour", (color) => {
    expect(calendarEventSchema.safeParse({ ...validEvent, color }).success).toBe(true);
  });

  it.each(EVENT_STATUS_OPTIONS)("accepts the %s status", (status) => {
    expect(calendarEventSchema.safeParse({ ...validEvent, status }).success).toBe(true);
  });

  it("rejects an unknown colour or status", () => {
    expect(calendarEventSchema.safeParse({ ...validEvent, color: "Art" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...validEvent, status: "done" }).success).toBe(false);
  });

  it("rejects wrong field types and missing fields", () => {
    expect(calendarEventSchema.safeParse({ ...validEvent, id: "1" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ title: "only a title" }).success).toBe(false);
  });
});
