import { describe, expect, it } from "vitest";

import { makeFlight } from "@/test/workspace-fixtures";

import { compareFlights, formatFlightName, parseFlightName, termForMonth } from "./entity-model";

describe("terms", () => {
  it("maps each month to the term it falls in", () => {
    expect([0, 4].map(termForMonth)).toEqual(["Spring", "Spring"]);
    expect([5, 7].map(termForMonth)).toEqual(["Summer", "Summer"]);
    expect([8, 11].map(termForMonth)).toEqual(["Fall", "Fall"]);
  });

  it("reads a flight name back into the pair it sorts by", () => {
    expect(parseFlightName("Fall 2026")).toEqual({ term: "Fall", year: 2026 });
    expect(parseFlightName("  spring 2027 ")).toEqual({ term: "Spring", year: 2027 });
  });

  it("returns nulls for a name it cannot parse, rather than guessing", () => {
    expect(parseFlightName("Block C")).toEqual({ term: null, year: null });
    expect(parseFlightName("Fall")).toEqual({ term: null, year: null });
    expect(parseFlightName("Winter 2026")).toEqual({ term: null, year: null });
  });

  it("formats a term and year the way it parses them", () => {
    const name = formatFlightName("Summer", 2026);

    expect(name).toBe("Summer 2026");
    expect(parseFlightName(name)).toEqual({ term: "Summer", year: 2026 });
  });
});

describe("compareFlights", () => {
  const sorted = (flights: ReturnType<typeof makeFlight>[]) =>
    [...flights].sort(compareFlights).map((flight) => flight.name);

  it("puts the newest term first, so the current one leads", () => {
    expect(
      sorted([
        makeFlight({ id: "a", name: "Spring 2026", term: "Spring", year: 2026 }),
        makeFlight({ id: "b", name: "Fall 2026", term: "Fall", year: 2026 }),
        makeFlight({ id: "c", name: "Fall 2027", term: "Fall", year: 2027 }),
        makeFlight({ id: "d", name: "Summer 2026", term: "Summer", year: 2026 }),
      ]),
    ).toEqual(["Fall 2027", "Fall 2026", "Summer 2026", "Spring 2026"]);
  });

  it("keeps unparsable names at the end, in their own order by name", () => {
    expect(
      sorted([
        makeFlight({ id: "a", name: "Block C", term: null, year: null }),
        makeFlight({ id: "b", name: "Fall 2026", term: "Fall", year: 2026 }),
        makeFlight({ id: "c", name: "Adult Ed", term: null, year: null }),
      ]),
    ).toEqual(["Fall 2026", "Adult Ed", "Block C"]);
  });
});
