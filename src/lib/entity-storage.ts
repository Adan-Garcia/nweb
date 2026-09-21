import {
  type Branch,
  BRANCH_COLORS,
  type BranchColor,
  type Flight,
  type FlightTerm,
  formatFlightName,
  type Nest,
  parseFlightName,
  type Wing,
} from "./entity-model";
import { getNotesDb } from "./notes-db";

/** Fields added after a row was written read back `undefined`, which is not `null`. */
function live<T extends { deletedAt: number | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deletedAt);
}

function stamps() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null };
}

export async function listWings(): Promise<Wing[]> {
  const database = await getNotesDb();
  return live(await database.getAll("wings")).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listFlights(): Promise<Flight[]> {
  const database = await getNotesDb();
  return live(await database.getAll("flights"));
}

export async function listBranches(): Promise<Branch[]> {
  const database = await getNotesDb();
  return live(await database.getAll("branches"));
}

export async function listNests(): Promise<Nest[]> {
  const database = await getNotesDb();
  return live(await database.getAll("nests"));
}

export async function createWing(name: string): Promise<Wing> {
  const database = await getNotesDb();
  const wing: Wing = { id: crypto.randomUUID(), name, ...stamps() };

  await database.put("wings", wing);
  return wing;
}

/**
 * A flight is named for its term so it can be sorted. A caller that passes a free-text
 * name keeps it, and the term and year are parsed out of it where they can be.
 */
export async function createFlight(input: {
  wingId: string;
  name?: string;
  term?: FlightTerm;
  year?: number;
}): Promise<Flight> {
  const database = await getNotesDb();
  const name =
    input.name ??
    (input.term && input.year ? formatFlightName(input.term, input.year) : "Untitled flight");
  const parsed = parseFlightName(name);
  const flight: Flight = {
    id: crypto.randomUUID(),
    wingId: input.wingId,
    name,
    term: input.term ?? parsed.term,
    year: input.year ?? parsed.year,
    ...stamps(),
  };

  await database.put("flights", flight);
  return flight;
}

/** Cycles the palette by how many branches the flight already has, so colours spread out. */
export async function createBranch(input: {
  flightId: string;
  name: string;
  color?: BranchColor;
}): Promise<Branch> {
  const database = await getNotesDb();
  const siblings = live(await database.getAll("branches")).filter(
    (branch) => branch.flightId === input.flightId,
  );
  const branch: Branch = {
    id: crypto.randomUUID(),
    flightId: input.flightId,
    name: input.name,
    color: input.color ?? BRANCH_COLORS[siblings.length % BRANCH_COLORS.length],
    ...stamps(),
  };

  await database.put("branches", branch);
  return branch;
}

export async function createNest(input: { branchId: string; name: string }): Promise<Nest> {
  const database = await getNotesDb();
  const nest: Nest = {
    id: crypto.randomUUID(),
    branchId: input.branchId,
    name: input.name,
    ...stamps(),
  };

  await database.put("nests", nest);
  return nest;
}

/**
 * The point of the entity layer: the name lives in one row, so nothing that references it
 * has to be rewritten and no note changes identity.
 */
export async function renameWing(id: string, name: string): Promise<Wing | null> {
  const database = await getNotesDb();
  const existing = await database.get("wings", id);

  if (!existing) {
    return null;
  }

  const next: Wing = { ...existing, name, updatedAt: Date.now() };
  await database.put("wings", next);
  return next;
}

/** Renaming a flight re-reads its term and year, so "Fall 2027" starts sorting as one. */
export async function renameFlight(id: string, name: string): Promise<Flight | null> {
  const database = await getNotesDb();
  const existing = await database.get("flights", id);

  if (!existing) {
    return null;
  }

  const next: Flight = { ...existing, name, ...parseFlightName(name), updatedAt: Date.now() };
  await database.put("flights", next);
  return next;
}

export async function renameBranch(id: string, name: string): Promise<Branch | null> {
  const database = await getNotesDb();
  const existing = await database.get("branches", id);

  if (!existing) {
    return null;
  }

  const next: Branch = { ...existing, name, updatedAt: Date.now() };
  await database.put("branches", next);
  return next;
}

export async function setBranchColor(id: string, color: BranchColor): Promise<Branch | null> {
  const database = await getNotesDb();
  const existing = await database.get("branches", id);

  if (!existing) {
    return null;
  }

  const next: Branch = { ...existing, color, updatedAt: Date.now() };
  await database.put("branches", next);
  return next;
}

export async function renameNest(id: string, name: string): Promise<Nest | null> {
  const database = await getNotesDb();
  const existing = await database.get("nests", id);

  if (!existing) {
    return null;
  }

  const next: Nest = { ...existing, name, updatedAt: Date.now() };
  await database.put("nests", next);
  return next;
}
