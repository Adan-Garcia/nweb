import { openRow, openRows, type SealedRow, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { anyReadOnly, isReadOnlyKey, ReadOnlyError } from "../keys/access";
import { cipherForObject, provisionObjectKey } from "../keys/object-keys";
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

/** Fields added after a row was written read back `undefined`, which is not `null`. */
function live<T extends { deletedAt: number | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deletedAt);
}

function stamps() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null };
}

/**
 * Names are sealed on the way in and opened on the way out, so every caller above this
 * module works in plaintext and none of them knows the lock exists. Sorting happens after
 * the names are open: ciphertext sorts by its IV, which is to say at random.
 */
export async function listWings(): Promise<Wing[]> {
  const database = await getNotesDb();
  const wings = await openRows(live(await database.getAll("wings")), "name");

  return wings.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listFlights(): Promise<Flight[]> {
  const database = await getNotesDb();
  return openRows(live(await database.getAll("flights")), "name");
}

export async function listBranches(): Promise<Branch[]> {
  const database = await getNotesDb();
  return openRows(live(await database.getAll("branches")), "name");
}

export async function listNests(): Promise<Nest[]> {
  const database = await getNotesDb();
  return openRows(live(await database.getAll("nests")), "name");
}

/**
 * The key an object's rows are sealed under is recorded on the row itself, as the cipher
 * marker every sealed row already carries. There is no second table saying which key
 * belongs to which thing: the row says it, which is also what a recipient reads.
 */
async function keyIdOf<Store extends "wings" | "flights" | "branches" | "nests">(
  store: Store,
  id: string | undefined,
): Promise<string | undefined> {
  if (!id) {
    return undefined;
  }

  const database = await getNotesDb();

  return (await database.get(store, id))?.keyId;
}

/**
 * A key for something new, hung under its parent — unless the parent was shared with this
 * account only to read, where nothing new can be hung at all.
 */
async function provisionUnder(kind: "flight" | "branch" | "nest", parentKeyId?: string) {
  if (anyReadOnly([parentKeyId])) {
    throw new ReadOnlyError();
  }

  return provisionObjectKey(kind, [parentKeyId]);
}

export async function createWing(name: string): Promise<Wing> {
  const database = await getNotesDb();
  const wing: Wing = { id: crypto.randomUUID(), name, ...stamps() };

  // A wing is the root: it has no container to hang under, so it keeps the workspace key
  // it was already being written with.
  await database.put("wings", await sealRow(wing, "name"));
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

  const cipher = await provisionUnder("flight", await keyIdOf("wings", input.wingId));

  await database.put("flights", await sealRow(flight, "name", cipher));
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

  const cipher = await provisionUnder("branch", await keyIdOf("flights", input.flightId));

  await database.put("branches", await sealRow(branch, "name", cipher));
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

  const cipher = await provisionUnder("nest", await keyIdOf("branches", input.branchId));

  await database.put("nests", await sealRow(nest, "name", cipher));
  return nest;
}

/**
 * The row a rename produces: the new name in plaintext, and no cipher marker, because
 * this is the object handed back to the caller. `sealRow` puts both on the stored copy.
 */
function renamed<T extends SealedRow & { name: string; updatedAt: number }>(
  existing: T,
  name: string,
): T {
  return { ...existing, name, updatedAt: Date.now(), encryption: undefined };
}

/** Re-seals with the key that row already carried, so a rename never moves it off its key. */
const resealAs = <T extends SealedRow & { name: string }>(existing: T, next: T) =>
  sealRow(next, "name", cipherForObject(existing.keyId));

/**
 * The point of the entity layer: the name lives in one row, so nothing that references it
 * has to be rewritten and no note changes identity.
 */
export async function renameWing(id: string, name: string): Promise<Wing | null> {
  const database = await getNotesDb();
  const existing = await database.get("wings", id);

  // Somebody else's, shared to read: theirs to rename, not this device's.
  if (!existing || isReadOnlyKey(existing.keyId)) {
    return null;
  }

  const next = renamed(existing, name);
  await database.put("wings", await resealAs(existing, next));
  return next;
}

/** Renaming a flight re-reads its term and year, so "Fall 2027" starts sorting as one. */
export async function renameFlight(id: string, name: string): Promise<Flight | null> {
  const database = await getNotesDb();
  const existing = await database.get("flights", id);

  // Somebody else's, shared to read: theirs to rename, not this device's.
  if (!existing || isReadOnlyKey(existing.keyId)) {
    return null;
  }

  // Term and year are parsed from the plaintext name and stored beside the sealed one:
  // they are what a flight sorts by, and a sort cannot open anything.
  const next: Flight = { ...renamed(existing, name), ...parseFlightName(name) };
  await database.put("flights", await resealAs(existing, next));
  return next;
}

export async function renameBranch(id: string, name: string): Promise<Branch | null> {
  const database = await getNotesDb();
  const existing = await database.get("branches", id);

  // Somebody else's, shared to read: theirs to rename, not this device's.
  if (!existing || isReadOnlyKey(existing.keyId)) {
    return null;
  }

  const next = renamed(existing, name);
  await database.put("branches", await resealAs(existing, next));
  return next;
}

/** The colour is not a name, so the stored row keeps whatever sealed name it already had. */
export async function setBranchColor(id: string, color: BranchColor): Promise<Branch | null> {
  const database = await getNotesDb();
  const existing = await database.get("branches", id);

  // Somebody else's, shared to read: theirs to rename, not this device's.
  if (!existing || isReadOnlyKey(existing.keyId)) {
    return null;
  }

  const next: Branch = { ...existing, color, updatedAt: Date.now() };
  await database.put("branches", next);
  return openRow(next, "name");
}

export async function renameNest(id: string, name: string): Promise<Nest | null> {
  const database = await getNotesDb();
  const existing = await database.get("nests", id);

  // Somebody else's, shared to read: theirs to rename, not this device's.
  if (!existing || isReadOnlyKey(existing.keyId)) {
    return null;
  }

  const next = renamed(existing, name);
  await database.put("nests", await resealAs(existing, next));
  return next;
}
