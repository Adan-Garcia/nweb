import { z } from "zod";

import { calendarEventSchema } from "./calendar-event";
import {
  type Branch,
  type BranchColor,
  type Flight,
  formatFlightName,
  type Nest,
  parseFlightName,
  termForMonth,
  type Wing,
} from "./entity-model";
import type { NotesDirectoryEntry } from "./notes-model";
import { BOARD_ORDER_STEP, type Twig } from "./twig-model";

/** A directory row as versions 1 to 3 wrote it: five strings, no ids. */
export const legacyDirectoryEntrySchema = z.object({
  id: z.string(),
  wing: z.string(),
  flight: z.string(),
  branch: z.string(),
  nest: z.string(),
  feather: z.string(),
  createdMode: z.enum(["linear", "spatial"]).catch("linear"),
  createdAt: z.number().catch(0),
  updatedAt: z.number().catch(0),
  deletedAt: z.number().nullable().catch(null),
});

export type LegacyDirectoryEntry = z.infer<typeof legacyDirectoryEntrySchema>;
export type LegacyCalendarEvent = z.infer<typeof calendarEventSchema>;

/** The five hard-coded calendar subjects, kept on the colours they already rendered with. */
const LEGACY_SUBJECT_COLORS: Record<string, BranchColor> = {
  Math: "emerald",
  History: "rose",
  Physics: "sky",
  GroupWork: "amber",
  Chemistry: "violet",
};

export type ConvertedWorkspace = {
  wings: Wing[];
  flights: Flight[];
  branches: Branch[];
  nests: Nest[];
  directory: NotesDirectoryEntry[];
  twigs: Twig[];
};

/**
 * Turns the five path strings on every note into records, and the old calendar events
 * into twigs under a branch named for their subject.
 *
 * Pure, so the database upgrade and a restore from a version 1 backup convert the same
 * way rather than drifting apart.
 */
export function convertLegacyWorkspace({
  entries,
  events,
  now = Date.now(),
}: {
  entries: LegacyDirectoryEntry[];
  events: LegacyCalendarEvent[];
  now?: number;
}): ConvertedWorkspace {
  const wings = new Map<string, Wing>();
  const flights = new Map<string, Flight>();
  const branches = new Map<string, Branch>();
  const nests = new Map<string, Nest>();

  const stamps = (at: number) => {
    const value = at > 0 ? at : now;
    return { createdAt: value, updatedAt: value, deletedAt: null };
  };

  const ensureWing = (name: string, at: number) => {
    const key = name.toLowerCase();
    const existing = wings.get(key);

    if (existing) {
      return existing;
    }

    const wing: Wing = { id: crypto.randomUUID(), name, ...stamps(at) };
    wings.set(key, wing);
    return wing;
  };

  const ensureFlight = (wingId: string, name: string, at: number) => {
    const key = `${wingId}\u0000${name.toLowerCase()}`;
    const existing = flights.get(key);

    if (existing) {
      return existing;
    }

    const flight: Flight = {
      id: crypto.randomUUID(),
      wingId,
      name,
      ...parseFlightName(name),
      ...stamps(at),
    };
    flights.set(key, flight);
    return flight;
  };

  const ensureBranch = (flightId: string, name: string, at: number) => {
    const key = `${flightId}\u0000${name.toLowerCase()}`;
    const existing = branches.get(key);

    if (existing) {
      return existing;
    }

    const branch: Branch = {
      id: crypto.randomUUID(),
      flightId,
      name,
      color: LEGACY_SUBJECT_COLORS[name] ?? "emerald",
      ...stamps(at),
    };
    branches.set(key, branch);
    return branch;
  };

  const ensureNest = (branchId: string, name: string, at: number) => {
    const key = `${branchId}\u0000${name.toLowerCase()}`;
    const existing = nests.get(key);

    if (existing) {
      return existing;
    }

    const nest: Nest = { id: crypto.randomUUID(), branchId, name, ...stamps(at) };
    nests.set(key, nest);
    return nest;
  };

  const directory: NotesDirectoryEntry[] = entries.map((legacy) => {
    const at = legacy.createdAt;
    const wing = ensureWing(legacy.wing, at);
    const flight = ensureFlight(wing.id, legacy.flight, at);
    const branch = ensureBranch(flight.id, legacy.branch, at);
    const nest = legacy.nest.trim() ? ensureNest(branch.id, legacy.nest, at) : null;

    return {
      id: legacy.id,
      branchId: branch.id,
      nestIds: nest ? [nest.id] : [],
      feather: legacy.feather,
      createdMode: legacy.createdMode,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      deletedAt: legacy.deletedAt,
    };
  });

  const twigs = events.length
    ? buildTwigs({ events, host: ensureCalendarHost(), ensureBranch, now })
    : [];

  /**
   * Events carry no wing or flight, so they hang off the workspace the notes already
   * describe. With no notes at all, one is created for them.
   */
  function ensureCalendarHost(): Flight {
    const existing = [...flights.values()][0];

    if (existing) {
      return existing;
    }

    const wing = ensureWing("My Wing", now);
    const date = new Date(now);

    return ensureFlight(
      wing.id,
      formatFlightName(termForMonth(date.getMonth()), date.getFullYear()),
      now,
    );
  }

  return {
    wings: [...wings.values()],
    flights: [...flights.values()],
    branches: [...branches.values()],
    nests: [...nests.values()],
    directory,
    twigs,
  };
}

function buildTwigs({
  events,
  host,
  ensureBranch,
  now,
}: {
  events: LegacyCalendarEvent[];
  host: Flight;
  ensureBranch: (flightId: string, name: string, at: number) => Branch;
  now: number;
}): Twig[] {
  return events.map((event, index) => ({
    id: crypto.randomUUID(),
    branchId: ensureBranch(host.id, event.color, now).id,
    nestIds: [],
    title: event.title,
    kind: "homework",
    dueDate: event.date,
    dueTime: event.time,
    status: event.status,
    boardOrder: index * BOARD_ORDER_STEP,
    featherId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}
