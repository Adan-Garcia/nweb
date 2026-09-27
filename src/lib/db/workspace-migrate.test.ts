import { describe, expect, it } from "vitest";

import { convertLegacyWorkspace, type LegacyDirectoryEntry } from "./workspace-migrate";

function legacyEntry(overrides: Partial<LegacyDirectoryEntry> = {}): LegacyDirectoryEntry {
  return {
    id: "note-1",
    wing: "My Wing",
    flight: "Fall 2026",
    branch: "Biology 101",
    nest: "Unit 1",
    feather: "Lecture",
    createdMode: "linear",
    createdAt: 10,
    updatedAt: 20,
    deletedAt: null,
    ...overrides,
  };
}

describe("convertLegacyWorkspace", () => {
  it("makes one record per distinct name and points the note at it", () => {
    const converted = convertLegacyWorkspace({ entries: [legacyEntry()], events: [] });

    expect(converted.wings).toHaveLength(1);
    expect(converted.flights[0]).toMatchObject({
      name: "Fall 2026",
      term: "Fall",
      year: 2026,
      wingId: converted.wings[0].id,
    });
    expect(converted.branches[0]).toMatchObject({ flightId: converted.flights[0].id });
    expect(converted.nests[0]).toMatchObject({ branchId: converted.branches[0].id });
    expect(converted.directory[0]).toMatchObject({
      id: "note-1",
      branchId: converted.branches[0].id,
      nestIds: [converted.nests[0].id],
      feather: "Lecture",
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it("shares one record between notes that repeated the same name", () => {
    const converted = convertLegacyWorkspace({
      entries: [
        legacyEntry({ id: "a", nest: "Unit 1" }),
        legacyEntry({ id: "b", nest: "Unit 2" }),
        // Case differences were the same segment before, and stay the same record.
        legacyEntry({ id: "c", branch: "biology 101", nest: "Unit 1" }),
      ],
      events: [],
    });

    expect(converted.wings).toHaveLength(1);
    expect(converted.flights).toHaveLength(1);
    expect(converted.branches).toHaveLength(1);
    expect(converted.nests).toHaveLength(2);
    expect(new Set(converted.directory.map((entry) => entry.branchId)).size).toBe(1);
  });

  it("keeps a name it cannot parse, and sorts it by nothing rather than guessing", () => {
    const converted = convertLegacyWorkspace({
      entries: [legacyEntry({ flight: "Block C" })],
      events: [],
    });

    expect(converted.flights[0]).toMatchObject({ name: "Block C", term: null, year: null });
  });

  it("gives a note with no unit no tag at all", () => {
    const converted = convertLegacyWorkspace({
      entries: [legacyEntry({ nest: "   " })],
      events: [],
    });

    expect(converted.nests).toEqual([]);
    expect(converted.directory[0].nestIds).toEqual([]);
  });

  it("carries a tombstone across instead of dropping the note", () => {
    const converted = convertLegacyWorkspace({
      entries: [legacyEntry({ deletedAt: 999 })],
      events: [],
    });

    expect(converted.directory[0].deletedAt).toBe(999);
  });

  it("turns each calendar event into a twig under a branch named for its subject", () => {
    const converted = convertLegacyWorkspace({
      entries: [legacyEntry()],
      events: [
        {
          id: 1,
          title: "Math Study Session",
          date: "2026-04-16",
          time: "3:30 PM",
          color: "Math",
          status: "incomplete",
        },
        {
          id: 2,
          title: "Math Quiz",
          date: "2026-04-18",
          time: "9:00 AM",
          color: "Math",
          status: "complete",
        },
      ],
    });

    // Both events name the same subject, so they share one new branch.
    const mathBranches = converted.branches.filter((branch) => branch.name === "Math");
    expect(mathBranches).toHaveLength(1);
    expect(converted.twigs).toHaveLength(2);
    expect(converted.twigs[0]).toMatchObject({
      title: "Math Study Session",
      dueDate: "2026-04-16",
      dueTime: "3:30 PM",
      status: "incomplete",
      branchId: mathBranches[0].id,
    });
    // The board order leaves room between rows, so a later drop rewrites one row.
    expect(converted.twigs[1].boardOrder).toBeGreaterThan(converted.twigs[0].boardOrder);
  });

  it("keeps the colours the five hard-coded subjects already rendered with", () => {
    const converted = convertLegacyWorkspace({
      entries: [],
      events: [
        {
          id: 1,
          title: "A",
          date: "2026-04-16",
          time: "9:00 AM",
          color: "History",
          status: "incomplete",
        },
      ],
    });

    expect(converted.branches.find((branch) => branch.name === "History")?.color).toBe("rose");
  });

  it("creates somewhere to put events when there are no notes at all", () => {
    const converted = convertLegacyWorkspace({
      entries: [],
      events: [
        {
          id: 1,
          title: "A",
          date: "2026-04-16",
          time: "9:00 AM",
          color: "Math",
          status: "incomplete",
        },
      ],
      now: Date.UTC(2026, 9, 1),
    });

    expect(converted.wings).toHaveLength(1);
    expect(converted.flights).toHaveLength(1);
    expect(converted.twigs[0].branchId).toBe(converted.branches[0].id);
  });

  it("hangs events off the flight the notes already describe", () => {
    const converted = convertLegacyWorkspace({
      entries: [legacyEntry()],
      events: [
        {
          id: 1,
          title: "A",
          date: "2026-04-16",
          time: "9:00 AM",
          color: "Math",
          status: "incomplete",
        },
      ],
    });

    expect(converted.flights).toHaveLength(1);
    const mathBranch = converted.branches.find((branch) => branch.name === "Math");
    expect(mathBranch?.flightId).toBe(converted.flights[0].id);
  });
});
