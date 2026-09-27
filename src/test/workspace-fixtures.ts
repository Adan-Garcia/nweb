import type { Branch, Flight, Nest, Wing } from "@/lib/hierarchy/entity-model";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import type { NotesDirectoryEntry } from "@/lib/notes/notes-model";
import type { Twig } from "@/lib/twigs/twig-model";

/**
 * Fixtures with fixed ids, so an assertion can name the branch it means instead of
 * digging a generated UUID back out of the snapshot.
 */
export const WING_ID = "wing-1";
export const FLIGHT_ID = "flight-1";
export const BRANCH_ID = "branch-1";
export const NEST_ID = "nest-1";

const STAMP = { createdAt: 1, updatedAt: 1, deletedAt: null };

export function makeWing(overrides: Partial<Wing> = {}): Wing {
  return { id: WING_ID, name: "My Wing", ...STAMP, ...overrides };
}

export function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: FLIGHT_ID,
    wingId: WING_ID,
    name: "Fall 2026",
    term: "Fall",
    year: 2026,
    ...STAMP,
    ...overrides,
  };
}

export function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: BRANCH_ID,
    flightId: FLIGHT_ID,
    name: "Biology 101",
    color: "emerald",
    ...STAMP,
    ...overrides,
  };
}

export function makeNest(overrides: Partial<Nest> = {}): Nest {
  return { id: NEST_ID, branchId: BRANCH_ID, name: "Unit 1", ...STAMP, ...overrides };
}

/** One wing, one flight, one branch and one nest — the smallest complete path. */
export function makeSnapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    wings: [makeWing()],
    flights: [makeFlight()],
    branches: [makeBranch()],
    nests: [makeNest()],
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<NotesDirectoryEntry> = {}): NotesDirectoryEntry {
  return {
    id: "note-1",
    branchId: BRANCH_ID,
    nestIds: [NEST_ID],
    feather: "Exam review",
    createdMode: "linear",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function makeTwig(overrides: Partial<Twig> = {}): Twig {
  return {
    id: "twig-1",
    branchId: BRANCH_ID,
    nestIds: [],
    title: "Lab report",
    kind: "homework",
    dueDate: "2026-04-16",
    dueTime: "3:30 PM",
    dueMinutes: 15 * 60 + 30,
    timeZone: "America/New_York",
    status: "incomplete",
    boardOrder: 0,
    featherId: null,
    feedId: null,
    seriesId: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}
