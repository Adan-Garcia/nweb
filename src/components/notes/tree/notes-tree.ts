import type { WorkspaceSelection } from "@/components/notes/location/location-hierarchy";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import {
  branchesForFlight,
  entriesForNest,
  flightsForWing,
  nestsForBranch,
  UNFILED_NEST_LABEL,
  type WorkspaceSnapshot,
} from "@/lib/hierarchy/workspace-tree";

export type NestGroup = {
  /** Null for the Unfiled group, which is a placeholder rather than a stored nest. */
  id: string | null;
  name: string;
  key: string;
  feathers: NotesDirectoryEntry[];
};

export type BranchGroup = {
  id: string;
  name: string;
  key: string;
  nests: NestGroup[];
};

export type FlightGroup = {
  id: string;
  name: string;
  key: string;
  branches: BranchGroup[];
};

export type WingGroup = {
  id: string;
  name: string;
  key: string;
  flights: FlightGroup[];
};

export function formatUpdatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Groups the saved notes under the entities they belong to, rather than under the strings
 * they used to repeat. A note tagged with two nests is listed under both, which is what
 * makes a tag navigable as if it were a level of the tree.
 *
 * Levels with nothing in them are dropped, so an empty flight does not sit in the way.
 */
export function buildTree(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
): WingGroup[] {
  const wingGroups: WingGroup[] = [];

  for (const wing of snapshot.wings) {
    const flightGroups: FlightGroup[] = [];

    for (const flight of flightsForWing(snapshot, wing.id)) {
      const branchGroups: BranchGroup[] = [];

      for (const branch of branchesForFlight(snapshot, flight.id)) {
        const nestGroups: NestGroup[] = [];

        for (const nest of nestsForBranch(snapshot, branch.id)) {
          const feathers = entriesForNest(entries, branch.id, nest.id);

          if (feathers.length) {
            nestGroups.push({
              id: nest.id,
              name: nest.name,
              key: `nest:${nest.id}`,
              feathers,
            });
          }
        }

        const unfiled = entriesForNest(entries, branch.id, null);

        if (unfiled.length) {
          nestGroups.push({
            id: null,
            name: UNFILED_NEST_LABEL,
            key: `nest:unfiled:${branch.id}`,
            feathers: unfiled,
          });
        }

        if (nestGroups.length) {
          branchGroups.push({
            id: branch.id,
            name: branch.name,
            key: `branch:${branch.id}`,
            nests: nestGroups,
          });
        }
      }

      if (branchGroups.length) {
        flightGroups.push({
          id: flight.id,
          name: flight.name,
          key: `flight:${flight.id}`,
          branches: branchGroups,
        });
      }
    }

    if (flightGroups.length) {
      wingGroups.push({
        id: wing.id,
        name: wing.name,
        key: `wing:${wing.id}`,
        flights: flightGroups,
      });
    }
  }

  return wingGroups;
}

/** Keys of the groups on the path to the open note, so they can be auto-expanded. */
export function getActivePathKeys(selection: WorkspaceSelection) {
  return [
    `wing:${selection.wingId}`,
    `flight:${selection.flightId}`,
    `branch:${selection.branchId}`,
    selection.nestId ? `nest:${selection.nestId}` : `nest:unfiled:${selection.branchId}`,
  ];
}
