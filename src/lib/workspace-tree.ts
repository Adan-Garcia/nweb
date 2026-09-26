import { type Branch, compareFlights, type Flight, type Nest, type Wing } from "./entity-model";
import type { NotesDirectoryEntry, NotesHierarchyLocation } from "./notes-model";

/** Every entity in the workspace, read once and passed around as plain data. */
export type WorkspaceSnapshot = {
  wings: Wing[];
  flights: Flight[];
  branches: Branch[];
  nests: Nest[];
  /**
   * Ids of rows that are only a name on the path to something shared with you — somebody
   * else's wing, term or course, known here by name and nothing more. They are shown so the
   * shared thing sits where it really lives, and are never offered for editing. Absent when
   * nothing shared came with a path.
   */
  pathOnly?: ReadonlySet<string>;
  /**
   * Ids of rows this account holds but was given only to read: a course or tag somebody
   * shared. Shown as they are, and never offered for renaming, deleting or filing anything
   * new under. Absent when there are none.
   */
  readOnly?: ReadonlySet<string>;
};

/** A branch together with the flight and wing above it. */
export type WorkspacePath = {
  wing: Wing;
  flight: Flight;
  branch: Branch;
};

/** Shown where a note carries no nest, so the path bar always has something to say. */
export const UNFILED_NEST_LABEL = "Unfiled";

/**
 * Shown in place of the term and wing above a course somebody shared.
 *
 * Those are real names on real rows, sealed under keys the recipient was never given, so
 * there is nothing to display and nothing worth inventing. Naming the situation is the
 * honest answer: the course is here, and where it came from is not.
 */
export const SHARED_SEGMENT_LABEL = "Shared with you";

export function emptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return { wings: [], flights: [], branches: [], nests: [] };
}

/**
 * This workspace's own rows, with the names on the paths to anything shared added beneath
 * them. A row this device already has is never replaced by a path's copy of it: the real
 * row is newer or the same, and it is the one that can be edited.
 */
export function withSharePaths(
  own: WorkspaceSnapshot,
  paths: Omit<WorkspaceSnapshot, "pathOnly">,
): WorkspaceSnapshot {
  const known = new Set(
    [...own.wings, ...own.flights, ...own.branches, ...own.nests].map((row) => row.id),
  );
  const pathOnly = new Set<string>();
  const unknown = <Row extends { id: string }>(rows: Row[]) =>
    rows.filter((row) => !known.has(row.id) && Boolean(pathOnly.add(row.id)));

  const added = {
    wings: unknown(paths.wings),
    flights: unknown(paths.flights),
    branches: unknown(paths.branches),
    nests: unknown(paths.nests),
  };

  if (!pathOnly.size) {
    return own;
  }

  return {
    wings: [...own.wings, ...added.wings].sort((a, b) => a.name.localeCompare(b.name)),
    flights: [...own.flights, ...added.flights],
    branches: [...own.branches, ...added.branches],
    nests: [...own.nests, ...added.nests],
    pathOnly,
    ...(own.readOnly ? { readOnly: own.readOnly } : {}),
  };
}

/**
 * The snapshot without anything this workspace may not change: names on somebody else's
 * path, and what was shared with it only to read.
 */
export function ownRows(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  if (!snapshot.pathOnly && !snapshot.readOnly) {
    return snapshot;
  }

  const own = <Row extends { id: string }>(rows: Row[]) =>
    rows.filter((row) => !isPathOnly(snapshot, row.id) && !isReadOnlyEntity(snapshot, row.id));

  return {
    wings: own(snapshot.wings),
    flights: own(snapshot.flights),
    branches: own(snapshot.branches),
    nests: own(snapshot.nests),
  };
}

/** Whether a row was shared with this account to read, and so is not its to change. */
export function isReadOnlyEntity(snapshot: WorkspaceSnapshot, id: string | null): boolean {
  return id !== null && (snapshot.readOnly?.has(id) ?? false);
}

/** Whether anything new may be filed under this row: not a path name, not read-only. */
export function canFileUnder(snapshot: WorkspaceSnapshot, id: string | null): boolean {
  return id === null || (!isPathOnly(snapshot, id) && !isReadOnlyEntity(snapshot, id));
}

/** Whether a row is only a name on somebody else's path, and so not this workspace's. */
export function isPathOnly(snapshot: WorkspaceSnapshot, id: string): boolean {
  return snapshot.pathOnly?.has(id) ?? false;
}

export function findWing(snapshot: WorkspaceSnapshot, id: string | null) {
  return snapshot.wings.find((wing) => wing.id === id) ?? null;
}

export function findFlight(snapshot: WorkspaceSnapshot, id: string | null) {
  return snapshot.flights.find((flight) => flight.id === id) ?? null;
}

export function findBranch(snapshot: WorkspaceSnapshot, id: string | null) {
  return snapshot.branches.find((branch) => branch.id === id) ?? null;
}

export function findNest(snapshot: WorkspaceSnapshot, id: string | null) {
  return snapshot.nests.find((nest) => nest.id === id) ?? null;
}

/** Newest term first. Flights whose name carries no term keep their own order, by name. */
export function flightsForWing(snapshot: WorkspaceSnapshot, wingId: string | null) {
  return snapshot.flights.filter((flight) => flight.wingId === wingId).sort(compareFlights);
}

export function branchesForFlight(snapshot: WorkspaceSnapshot, flightId: string | null) {
  return snapshot.branches
    .filter((branch) => branch.flightId === flightId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The courses a selection should offer.
 *
 * "No term" means two different things and they must not be conflated: a wing of your own
 * that has no terms yet, and the "Shared with you" entry, which stands under no wing at
 * all. Only the second lists shared courses — keying on the term alone would file somebody
 * else's course inside a new wing of yours.
 *
 * Both the dropdown and the cascade come through here, so the distinction is made once.
 */
export function branchesForSelection(
  snapshot: WorkspaceSnapshot,
  wingId: string | null,
  flightId: string | null,
) {
  if (wingId === null && flightId === null) {
    return sharedBranches(snapshot);
  }

  return branchesForFlight(snapshot, flightId);
}

export function nestsForBranch(snapshot: WorkspaceSnapshot, branchId: string | null) {
  return snapshot.nests
    .filter((nest) => nest.branchId === branchId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A branch, with as much of what is above it as this device can actually read. */
export type ResolvedBranch = {
  branch: Branch;
  flight: Flight | null;
  wing: Wing | null;
  /** True when the levels above it are not here at all: a course somebody shared. */
  isShared: boolean;
};

/**
 * Walks up from a branch, and keeps whatever it finds.
 *
 * Deliberately not all-or-nothing. A course shared with you arrives with its own key and
 * without the term and wing above it, because those are names under keys you were not
 * given — and dropping the course's own name along with them would lose the one thing that
 * *is* readable. Null means the branch itself is missing, which is the only case with
 * nothing to show.
 *
 * A live branch whose flight is absent is a shared one rather than an orphan: deleting a
 * term tombstones everything under it (`entity-delete.ts`), so a local delete takes the
 * branch too and it never reaches here.
 */
export function branchPath(
  snapshot: WorkspaceSnapshot,
  branchId: string | null,
): ResolvedBranch | null {
  const branch = findBranch(snapshot, branchId);

  if (!branch) {
    return null;
  }

  const flight = findFlight(snapshot, branch.flightId);
  const wing = flight ? findWing(snapshot, flight.wingId) : null;

  return { branch, flight, wing, isShared: !flight || !wing };
}

/**
 * Courses whose term this device cannot read, by name.
 *
 * This is where a shared course lives in the path bar. It has no reachable flight, so "no
 * term chosen" is not a gap it falls through but precisely the place it belongs.
 */
export function sharedBranches(snapshot: WorkspaceSnapshot) {
  return snapshot.branches
    .filter((branch) => !findFlight(snapshot, branch.flightId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The five names a note is displayed under. `nestId` picks which nest to show for a note
 * that carries several; without one the first by name wins, so the label is stable.
 */
export function displayLocation(
  snapshot: WorkspaceSnapshot,
  entry: NotesDirectoryEntry,
  nestId?: string | null,
): NotesHierarchyLocation {
  const path = branchPath(snapshot, entry.branchId);
  const nests = entry.nestIds
    .map((id) => findNest(snapshot, id))
    .filter((nest): nest is Nest => nest !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = nests.find((nest) => nest.id === nestId) ?? nests[0] ?? null;

  return {
    // A shared course says so once, on the wing, and leaves the term blank. Both segments
    // are joined into one string by `formatLocationPath`, and saying it twice would read
    // as though it meant two different things.
    wing: path?.wing?.name ?? (path?.isShared ? SHARED_SEGMENT_LABEL : ""),
    flight: path?.flight?.name ?? "",
    branch: path?.branch.name ?? "",
    nest: chosen?.name ?? UNFILED_NEST_LABEL,
    feather: entry.feather,
  };
}

/**
 * Notes shown under a nest. A note with two nests really does appear under both, which is
 * what makes a tag navigable as if it were a level of the path.
 */
export function entriesForNest(
  entries: NotesDirectoryEntry[],
  branchId: string | null,
  nestId: string | null,
) {
  return entries
    .filter((entry) => {
      if (entry.branchId !== branchId) {
        return false;
      }

      return nestId === null ? entry.nestIds.length === 0 : entry.nestIds.includes(nestId);
    })
    .sort((a, b) => a.feather.localeCompare(b.feather));
}

export function formatLocationPath(location: NotesHierarchyLocation) {
  return [location.wing, location.flight, location.branch, location.nest, location.feather]
    .filter((segment) => segment.length > 0)
    .join(" / ");
}
