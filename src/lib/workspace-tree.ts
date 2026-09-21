import { type Branch, compareFlights, type Flight, type Nest, type Wing } from "./entity-model";
import type { NotesDirectoryEntry, NotesHierarchyLocation } from "./notes-model";

/** Every entity in the workspace, read once and passed around as plain data. */
export type WorkspaceSnapshot = {
  wings: Wing[];
  flights: Flight[];
  branches: Branch[];
  nests: Nest[];
};

/** A branch together with the flight and wing above it. */
export type WorkspacePath = {
  wing: Wing;
  flight: Flight;
  branch: Branch;
};

/** Shown where a note carries no nest, so the path bar always has something to say. */
export const UNFILED_NEST_LABEL = "Unfiled";

export function emptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return { wings: [], flights: [], branches: [], nests: [] };
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

export function nestsForBranch(snapshot: WorkspaceSnapshot, branchId: string | null) {
  return snapshot.nests
    .filter((nest) => nest.branchId === branchId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Walks up from a branch. Returns null if any level above it has been deleted. */
export function branchPath(snapshot: WorkspaceSnapshot, branchId: string | null) {
  const branch = findBranch(snapshot, branchId);
  const flight = branch ? findFlight(snapshot, branch.flightId) : null;
  const wing = flight ? findWing(snapshot, flight.wingId) : null;

  if (!branch || !flight || !wing) {
    return null;
  }

  return { wing, flight, branch } satisfies WorkspacePath;
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
    wing: path?.wing.name ?? "",
    flight: path?.flight.name ?? "",
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
