import type { NotesDirectoryEntry } from "@/components/notes/types";
import {
  branchesForFlight,
  branchPath,
  entriesForNest,
  findNest,
  flightsForWing,
  nestsForBranch,
  UNFILED_NEST_LABEL,
  type WorkspaceSnapshot,
} from "@/lib/workspace-tree";

export type LocationSegment = "wing" | "flight" | "branch" | "nest" | "feather";

export const LOCATION_SEGMENTS: LocationSegment[] = ["wing", "flight", "branch", "nest", "feather"];

/**
 * Where the path bar is pointing, as ids. Names live on the entity rows, so renaming a
 * wing changes what every note displays without touching a single note.
 *
 * `nestId` is null for the Unfiled group: a nest is a tag, so a note can carry none, and
 * one that carries several is reachable under each of them.
 */
export type WorkspaceSelection = {
  wingId: string | null;
  flightId: string | null;
  branchId: string | null;
  nestId: string | null;
  featherId: string | null;
};

export type SegmentOption = {
  id: string | null;
  name: string;
};

export type SegmentModalState = {
  segment: LocationSegment;
  label: string;
};

export const EMPTY_SELECTION: WorkspaceSelection = {
  wingId: null,
  flightId: null,
  branchId: null,
  nestId: null,
  featherId: null,
};

/** Where a note sits, preferring the nest it was reached through when it has several. */
export function selectionForEntry(
  snapshot: WorkspaceSnapshot,
  entry: NotesDirectoryEntry,
  preferredNestId?: string | null,
): WorkspaceSelection {
  const path = branchPath(snapshot, entry.branchId);
  const nestId =
    preferredNestId && entry.nestIds.includes(preferredNestId)
      ? preferredNestId
      : (nestsForBranch(snapshot, entry.branchId).find((nest) => entry.nestIds.includes(nest.id))
          ?.id ?? null);

  return {
    wingId: path?.wing.id ?? null,
    flightId: path?.flight.id ?? null,
    branchId: entry.branchId,
    nestId,
    featherId: entry.id,
  };
}

/** Unfiled is always offered, so notes carrying no tag stay reachable from the path bar. */
export function segmentOptions(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
  selection: WorkspaceSelection,
): Record<LocationSegment, SegmentOption[]> {
  const toOption = (entity: { id: string; name: string }) => ({
    id: entity.id,
    name: entity.name,
  });

  return {
    wing: snapshot.wings.map(toOption),
    flight: flightsForWing(snapshot, selection.wingId).map(toOption),
    branch: branchesForFlight(snapshot, selection.flightId).map(toOption),
    nest: [
      ...nestsForBranch(snapshot, selection.branchId).map(toOption),
      { id: null, name: UNFILED_NEST_LABEL },
    ],
    feather: entriesForNest(entries, selection.branchId, selection.nestId).map((entry) => ({
      id: entry.id,
      name: entry.feather,
    })),
  };
}

/** What each dropdown shows when it is closed. */
export function segmentLabels(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
  selection: WorkspaceSelection,
): Record<LocationSegment, string> {
  const path = branchPath(snapshot, selection.branchId);
  const activeEntry = entries.find((entry) => entry.id === selection.featherId) ?? null;

  return {
    wing: snapshot.wings.find((wing) => wing.id === selection.wingId)?.name ?? "No wing",
    flight:
      snapshot.flights.find((flight) => flight.id === selection.flightId)?.name ?? "No flight",
    branch: path?.branch.name ?? "No branch",
    nest: findNest(snapshot, selection.nestId)?.name ?? UNFILED_NEST_LABEL,
    feather: activeEntry?.feather ?? "No note",
  };
}

export function formatSelectionSummary(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
  selection: WorkspaceSelection,
) {
  const labels = segmentLabels(snapshot, entries, selection);

  return LOCATION_SEGMENTS.map((segment) => labels[segment]).join(" / ");
}

/**
 * Changing one level re-picks the levels under it, so the path bar never shows a branch
 * that is not in the chosen flight. Anything with no children below it lands on null,
 * which the create dialog reads as "nothing here yet".
 */
export function resolveCascade(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
  selection: WorkspaceSelection,
  segment: LocationSegment,
  nextId: string | null,
): WorkspaceSelection {
  const next: WorkspaceSelection = { ...selection, ...segmentPatch(segment, nextId) };
  const depth = LOCATION_SEGMENTS.indexOf(segment);

  if (depth <= LOCATION_SEGMENTS.indexOf("wing")) {
    next.flightId = flightsForWing(snapshot, next.wingId)[0]?.id ?? null;
  }

  if (depth <= LOCATION_SEGMENTS.indexOf("flight")) {
    next.branchId = branchesForFlight(snapshot, next.flightId)[0]?.id ?? null;
  }

  if (depth <= LOCATION_SEGMENTS.indexOf("branch")) {
    next.nestId = firstPopulatedNestId(snapshot, entries, next.branchId);
  }

  if (depth <= LOCATION_SEGMENTS.indexOf("nest")) {
    next.featherId = entriesForNest(entries, next.branchId, next.nestId)[0]?.id ?? null;
  }

  return next;
}

/** Written out rather than built from a template literal, so the key stays typed. */
function segmentPatch(segment: LocationSegment, id: string | null): Partial<WorkspaceSelection> {
  switch (segment) {
    case "wing":
      return { wingId: id };
    case "flight":
      return { flightId: id };
    case "branch":
      return { branchId: id };
    case "nest":
      return { nestId: id };
    default:
      return { featherId: id };
  }
}

/**
 * Prefers a nest that actually has notes in it, so stepping into a branch lands on
 * something to read rather than on the first empty tag in the alphabet.
 */
function firstPopulatedNestId(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
  branchId: string | null,
): string | null {
  const nests = nestsForBranch(snapshot, branchId);
  const populated = nests.find((nest) => entriesForNest(entries, branchId, nest.id).length > 0);

  if (populated) {
    return populated.id;
  }

  if (entriesForNest(entries, branchId, null).length > 0) {
    return null;
  }

  return nests[0]?.id ?? null;
}
