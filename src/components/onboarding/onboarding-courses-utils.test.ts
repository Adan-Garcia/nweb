import { describe, expect, it } from "vitest";

import type { Branch, Flight } from "@/lib/hierarchy/entity-model";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";

import { coursesFormFor, planCourseChanges } from "./onboarding-courses-utils";

const stamps = { createdAt: 1, updatedAt: 1, deletedAt: null };
const flight: Flight = {
  id: "f1",
  wingId: "w1",
  name: "Fall 2026",
  term: "Fall",
  year: 2026,
  ...stamps,
};

function branch(id: string, name: string): Branch {
  return { id, flightId: "f1", name, color: "emerald", ...stamps };
}

function snapshot(branches: Branch[]): WorkspaceSnapshot {
  return { wings: [], flights: [flight], branches, nests: [] };
}

describe("coursesFormFor", () => {
  it("offers the placeholder course as a blank row to type the first course into", () => {
    const { values, origin } = coursesFormFor(snapshot([branch("b1", "General")]), flight);

    expect(values).toEqual({ term: "Fall 2026", courses: [{ branchId: "b1", name: "" }] });
    expect(origin.names.get("b1")).toBe("General");
  });

  it("lists real courses by name, with one empty row after them", () => {
    const { values } = coursesFormFor(
      snapshot([branch("b2", "Physics"), branch("b1", "Chemistry")]),
      flight,
    );

    expect(values.courses).toEqual([
      { branchId: "b1", name: "Chemistry" },
      { branchId: "b2", name: "Physics" },
      { branchId: null, name: "" },
    ]);
  });
});

describe("planCourseChanges", () => {
  const origin = {
    flightId: "f1",
    term: "Fall 2026",
    names: new Map([
      ["b1", "General"],
      ["b2", "Physics"],
    ]),
  };

  it("renames what changed, creates what is new, and leaves blank rows alone", () => {
    expect(
      planCourseChanges(origin, {
        term: "Spring 2027",
        courses: [
          { branchId: "b1", name: "Chemistry" },
          { branchId: "b2", name: "Physics" },
          { branchId: null, name: "Biology" },
          { branchId: null, name: "" },
        ],
      }),
    ).toEqual({
      term: "Spring 2027",
      renames: [{ branchId: "b1", name: "Chemistry" }],
      creates: ["Biology"],
    });
  });

  it("writes nothing when nothing changed, and never deletes a course left blank", () => {
    expect(
      planCourseChanges(origin, {
        term: "Fall 2026",
        courses: [
          { branchId: "b1", name: "" },
          { branchId: "b2", name: "Physics" },
        ],
      }),
    ).toEqual({ term: null, renames: [], creates: [] });
  });
});
