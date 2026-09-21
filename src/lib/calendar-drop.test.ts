import { describe, expect, it } from "vitest";

import { dateKeyFromDayId, dayId, resolveCalendarDrop } from "./calendar-drop";

describe("day ids", () => {
  it("round-trips a date key", () => {
    expect(dateKeyFromDayId(dayId("2026-04-16"))).toBe("2026-04-16");
  });

  it("refuses an id that is not a day, so a twig id can never be mistaken for one", () => {
    expect(dateKeyFromDayId("0a5d8f22-1d2e-4a3b-9c11-2f4e6a8b0c1d")).toBeNull();
    expect(dateKeyFromDayId("column:incomplete")).toBeNull();
    expect(dateKeyFromDayId("day:not-a-date")).toBeNull();
    expect(dateKeyFromDayId("day:2026-4-16")).toBeNull();
  });
});

describe("resolveCalendarDrop", () => {
  const drop = (overId: string | null, currentDueDate: string | null) =>
    resolveCalendarDrop({ activeId: "twig-1", overId, currentDueDate });

  it("reschedules onto the day it was dropped on", () => {
    expect(drop(dayId("2026-04-20"), "2026-04-16")).toEqual({
      twigId: "twig-1",
      dueDate: "2026-04-20",
    });
  });

  it("gives an undated task the day it lands on", () => {
    expect(drop(dayId("2026-04-20"), null)).toEqual({
      twigId: "twig-1",
      dueDate: "2026-04-20",
    });
  });

  it("is no move when it lands back on the day it already had", () => {
    expect(drop(dayId("2026-04-16"), "2026-04-16")).toBeNull();
  });

  it("is no move when it lands on nothing, or on something that is not a day", () => {
    expect(drop(null, "2026-04-16")).toBeNull();
    expect(drop("some-twig-id", "2026-04-16")).toBeNull();
  });
});
