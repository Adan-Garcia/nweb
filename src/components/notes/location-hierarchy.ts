import {
  createDefaultNotesLocation,
  sanitizeLocationSegment,
} from "@/components/notes/constants";
import type {
  NotesDirectoryEntry,
  NotesHierarchyLocation,
} from "@/components/notes/types";

export const FALLBACK_LOCATION = createDefaultNotesLocation();

export function toLocation(entry: NotesDirectoryEntry): NotesHierarchyLocation {
  return {
    wing: entry.wing,
    flight: entry.flight,
    branch: entry.branch,
    nest: entry.nest,
    feather: entry.feather,
  };
}

export function normalizeLocation(
  location: NotesHierarchyLocation,
): NotesHierarchyLocation {
  return {
    wing: sanitizeLocationSegment(location.wing) || FALLBACK_LOCATION.wing,
    flight:
      sanitizeLocationSegment(location.flight) || FALLBACK_LOCATION.flight,
    branch:
      sanitizeLocationSegment(location.branch) || FALLBACK_LOCATION.branch,
    nest: sanitizeLocationSegment(location.nest) || FALLBACK_LOCATION.nest,
    feather:
      sanitizeLocationSegment(location.feather) || FALLBACK_LOCATION.feather,
  };
}

export type LocationSegment = keyof NotesHierarchyLocation;

export type SegmentModalState = {
  segment: LocationSegment;
  label: string;
};

const locationSegments: LocationSegment[] = [
  "wing",
  "flight",
  "branch",
  "nest",
  "feather",
];

export function buildSegmentOptions(values: string[], activeValue: string) {
  const nextValues = new Set(values.filter((value) => value.trim().length > 0));

  if (activeValue.trim().length > 0) {
    nextValues.add(activeValue);
  }

  return Array.from(nextValues).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function getEntryForLocation(
  entries: NotesDirectoryEntry[],
  location: NotesHierarchyLocation,
) {
  return (
    entries.find(
      (entry) =>
        entry.wing === location.wing &&
        entry.flight === location.flight &&
        entry.branch === location.branch &&
        entry.nest === location.nest &&
        entry.feather === location.feather,
    ) ?? null
  );
}

export function listSegmentOptions(
  entries: NotesDirectoryEntry[],
  location: NotesHierarchyLocation,
  segment: LocationSegment,
) {
  const segmentValues = entries
    .filter((entry) => {
      if (segment === "wing") {
        return true;
      }

      if (segment === "flight") {
        return entry.wing === location.wing;
      }

      if (segment === "branch") {
        return entry.wing === location.wing && entry.flight === location.flight;
      }

      if (segment === "nest") {
        return (
          entry.wing === location.wing &&
          entry.flight === location.flight &&
          entry.branch === location.branch
        );
      }

      return (
        entry.wing === location.wing &&
        entry.flight === location.flight &&
        entry.branch === location.branch &&
        entry.nest === location.nest
      );
    })
    .map((entry) => entry[segment]);

  const uniqueValues = new Set(
    segmentValues.filter((value) => value.trim().length > 0),
  );

  return Array.from(uniqueValues).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function resolveCascadingLocation(
  entries: NotesDirectoryEntry[],
  current: NotesHierarchyLocation,
  segment: LocationSegment,
  nextValue: string,
) {
  const nextLocation = {
    ...current,
    [segment]: nextValue,
  } as NotesHierarchyLocation;

  const changedSegmentIndex = locationSegments.indexOf(segment);

  for (
    let segmentIndex = changedSegmentIndex + 1;
    segmentIndex < locationSegments.length;
    segmentIndex += 1
  ) {
    const childSegment = locationSegments[segmentIndex];
    const childOptions = listSegmentOptions(
      entries,
      nextLocation,
      childSegment,
    );

    if (!childOptions.length) {
      continue;
    }

    if (!childOptions.includes(nextLocation[childSegment])) {
      nextLocation[childSegment] = childOptions[0];
    }
  }

  return nextLocation;
}
