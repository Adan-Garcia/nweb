import { z } from "zod";

import { cipherNameSchema } from "./cipher";

/**
 * The shared spine of every workspace record. UUID ids, `updatedAt` and a `deletedAt`
 * tombstone are on every entity from the start: retrofitting them once a user has data is
 * a second migration, and a future sync cannot merge or delete safely without them.
 */
export const entityBaseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable().default(null),
  /**
   * Which cipher wrote this row's one display name — `name` here, `title` on a twig. Rows
   * written before the lock covered names read back `undefined`, which means plaintext.
   * Only the name is affected: everything else in the row is stored as it always was.
   */
  encryption: cipherNameSchema.optional(),
  /** Which key sealed the name. Absent on a row written before keys had ids. */
  keyId: z.string().optional(),
});

/** Academic terms, in the order they fall inside one calendar year. */
export const FLIGHT_TERMS = ["Spring", "Summer", "Fall"] as const;

export type FlightTerm = (typeof FLIGHT_TERMS)[number];

/**
 * Branch colours, used for the dot beside a twig and the column accents on the board.
 * Names rather than classes, so a stored row never carries a Tailwind utility.
 */
export const BRANCH_COLORS = [
  "emerald",
  "rose",
  "sky",
  "amber",
  "violet",
  "teal",
  "orange",
  "indigo",
] as const;

export type BranchColor = (typeof BRANCH_COLORS)[number];

export const wingSchema = entityBaseSchema.extend({
  name: z.string(),
});

export const flightSchema = entityBaseSchema.extend({
  wingId: z.string(),
  name: z.string(),
  /**
   * Term and year are what a flight sorts by. They are nullable because a flight created
   * before this existed is free text ("Fall 2026" parses, "Block C" does not) and dropping
   * a name we cannot parse would lose the user's own label.
   */
  term: z.enum(FLIGHT_TERMS).nullable().default(null),
  year: z.number().int().nullable().default(null),
});

export const branchSchema = entityBaseSchema.extend({
  flightId: z.string(),
  name: z.string(),
  color: z.enum(BRANCH_COLORS).default("emerald"),
});

/**
 * A nest is a tag, not a level: a note or twig carries a list of them. The path bar still
 * navigates by nest, which is why one belongs to a branch rather than floating free.
 */
export const nestSchema = entityBaseSchema.extend({
  branchId: z.string(),
  name: z.string(),
});

export type Wing = z.infer<typeof wingSchema>;
export type Flight = z.infer<typeof flightSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type Nest = z.infer<typeof nestSchema>;

/** Every entity store keyed by its record type, so storage helpers can stay generic. */
export type EntityByStore = {
  wings: Wing;
  flights: Flight;
  branches: Branch;
  nests: Nest;
};

export type EntityStoreName = keyof EntityByStore;

export const ENTITY_STORE_NAMES: EntityStoreName[] = ["wings", "flights", "branches", "nests"];

export const ENTITY_SCHEMAS = {
  wings: wingSchema,
  flights: flightSchema,
  branches: branchSchema,
  nests: nestSchema,
} as const;

/** The term a date falls in, matching the month ranges the note defaults already used. */
export function termForMonth(monthIndex: number): FlightTerm {
  if (monthIndex <= 4) {
    return "Spring";
  }

  if (monthIndex <= 7) {
    return "Summer";
  }

  return "Fall";
}

/**
 * Reads "Fall 2026" back into the pair it sorts by. Anything else returns nulls, and the
 * flight keeps its name and sorts after the ones that could be parsed.
 */
export function parseFlightName(name: string): { term: FlightTerm | null; year: number | null } {
  const match = /^\s*(Spring|Summer|Fall)\s+(\d{4})\s*$/i.exec(name);

  if (!match) {
    return { term: null, year: null };
  }

  const term = FLIGHT_TERMS.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase());

  return { term: term ?? null, year: Number(match[2]) };
}

export function formatFlightName(term: FlightTerm, year: number) {
  return `${term} ${year}`;
}

/**
 * Newest term first, so the flight a student is in now leads the list. Flights with no
 * parsable term keep their own order at the end, by name.
 */
export function compareFlights(left: Flight, right: Flight) {
  const leftYear = left.year;
  const rightYear = right.year;

  if (leftYear === null || left.term === null) {
    return rightYear === null || right.term === null ? left.name.localeCompare(right.name) : 1;
  }

  if (rightYear === null || right.term === null) {
    return -1;
  }

  if (leftYear !== rightYear) {
    return rightYear - leftYear;
  }

  return FLIGHT_TERMS.indexOf(right.term) - FLIGHT_TERMS.indexOf(left.term);
}
