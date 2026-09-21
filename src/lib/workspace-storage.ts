import {
  type Branch,
  type Flight,
  formatFlightName,
  termForMonth,
  type Wing,
} from "./entity-model";
import {
  createBranch,
  createFlight,
  createWing,
  listBranches,
  listFlights,
  listNests,
  listWings,
} from "./entity-storage";
import {
  branchesForFlight,
  flightsForWing,
  type WorkspacePath,
  type WorkspaceSnapshot,
} from "./workspace-tree";

export const DEFAULT_WING_NAME = "My Wing";
export const DEFAULT_BRANCH_NAME = "General";

export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [wings, flights, branches, nests] = await Promise.all([
    listWings(),
    listFlights(),
    listBranches(),
    listNests(),
  ]);

  return { wings, flights, branches, nests };
}

/** The flight a new workspace starts in: the term today falls in. */
export function currentFlightName(now = new Date()) {
  return formatFlightName(termForMonth(now.getMonth()), now.getFullYear());
}

/**
 * Guarantees there is somewhere to put a note. A note must belong to a branch, so an
 * empty database — a first run, or one whose only wing was deleted — gets the same
 * default path the string-based version used to fall back to.
 */
export async function ensureDefaultWorkspace(): Promise<{
  snapshot: WorkspaceSnapshot;
  path: WorkspacePath;
}> {
  let snapshot = await loadWorkspaceSnapshot();

  const wing: Wing = snapshot.wings[0] ?? (await createWing(DEFAULT_WING_NAME));
  let flight: Flight | undefined = flightsForWing(snapshot, wing.id)[0];

  if (!flight) {
    flight = await createFlight({ wingId: wing.id, name: currentFlightName() });
  }

  let branch: Branch | undefined = branchesForFlight(snapshot, flight.id)[0];

  if (!branch) {
    branch = await createBranch({ flightId: flight.id, name: DEFAULT_BRANCH_NAME });
  }

  snapshot = await loadWorkspaceSnapshot();

  return { snapshot, path: { wing, flight, branch } };
}
