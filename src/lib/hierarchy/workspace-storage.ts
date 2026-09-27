import { getNotesDb } from "../db/notes-db";
import { isReadOnlyKey } from "../keys/access";
import {
  type Branch,
  ENTITY_STORE_NAMES,
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
import { listSharePathEntities } from "./share-path-storage";
import {
  branchesForFlight,
  flightsForWing,
  withSharePaths,
  type WorkspacePath,
  type WorkspaceSnapshot,
} from "./workspace-tree";

export const DEFAULT_WING_NAME = "My Wing";
export const DEFAULT_BRANCH_NAME = "General";

/** Only the rows this workspace holds itself: what a new note may be filed under. */
async function loadOwnSnapshot(): Promise<WorkspaceSnapshot> {
  const [wings, flights, branches, nests, readOnly] = await Promise.all([
    listWings(),
    listFlights(),
    listBranches(),
    listNests(),
    readOnlyEntityIds(),
  ]);

  return { wings, flights, branches, nests, ...(readOnly.size ? { readOnly } : {}) };
}

/**
 * The rows held here under a key shared only to read. The listed rows arrive opened, with
 * their key taken off, so the stored ones are asked instead — `keyId` is never sealed.
 */
async function readOnlyEntityIds(): Promise<Set<string>> {
  const database = await getNotesDb();
  const stored = await Promise.all(ENTITY_STORE_NAMES.map((store) => database.getAll(store)));
  const readOnly = new Set<string>();

  for (const row of stored.flat()) {
    if (isReadOnlyKey(row.keyId)) {
      readOnly.add(row.id);
    }
  }

  return readOnly;
}

/** Everything the path bar shows: this workspace, and the paths to what was shared into it. */
export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [own, paths] = await Promise.all([loadOwnSnapshot(), listSharePathEntities()]);

  return withSharePaths(own, paths);
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
  // Own rows only: a default note must never be filed under somebody else's wing because
  // a path to something they shared happens to sort first.
  let snapshot = await loadOwnSnapshot();

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
