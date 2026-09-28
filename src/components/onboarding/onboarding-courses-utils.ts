import { z } from "zod";

import type { Flight } from "@/lib/hierarchy/entity-model";
import { DEFAULT_BRANCH_NAME } from "@/lib/hierarchy/workspace-storage";
import {
  branchesForFlight,
  canFileUnder,
  type WorkspaceSnapshot,
} from "@/lib/hierarchy/workspace-tree";

export const coursesFormSchema = z.object({
  term: z.string().trim().min(1, "Name the term").max(80, "That name is too long"),
  courses: z.array(
    z.object({
      /** The course this row renames, or null for one to create. */
      branchId: z.string().nullable(),
      name: z.string().trim().max(120, "That name is too long"),
    }),
  ),
});

export type CoursesFormValues = z.infer<typeof coursesFormSchema>;

/** What the form started from, so saving writes only what changed. */
export type CoursesOrigin = {
  flightId: string;
  term: string;
  names: ReadonlyMap<string, string>;
};

/**
 * The form for one term: its name, and a row per course this workspace may file under.
 *
 * A first run has one course, the placeholder a new workspace is given so a note always has
 * somewhere to go. Its row starts blank rather than saying "General": the first course typed
 * becomes it, and leaving it blank keeps it as it is.
 */
export function coursesFormFor(
  snapshot: WorkspaceSnapshot,
  flight: Flight,
): { values: CoursesFormValues; origin: CoursesOrigin } {
  const branches = branchesForFlight(snapshot, flight.id).filter((branch) =>
    canFileUnder(snapshot, branch.id),
  );
  const isPlaceholder = branches.length === 1 && branches[0].name === DEFAULT_BRANCH_NAME;
  const courses = branches.map((branch) => ({
    branchId: branch.id,
    name: isPlaceholder ? "" : branch.name,
  }));

  return {
    values: {
      term: flight.name,
      // Always one empty row to type into.
      courses: isPlaceholder ? courses : [...courses, { branchId: null, name: "" }],
    },
    origin: {
      flightId: flight.id,
      term: flight.name,
      names: new Map(branches.map((branch) => [branch.id, branch.name])),
    },
  };
}

export type CourseChanges = {
  term: string | null;
  renames: { branchId: string; name: string }[];
  creates: string[];
};

/**
 * The writes a submitted form comes to. A blank row is left alone rather than read as "delete
 * this course": deleting takes a course's notes and tasks with it, which is Settings' to
 * ask about, not a setup screen's.
 */
export function planCourseChanges(origin: CoursesOrigin, values: CoursesFormValues): CourseChanges {
  const renames: CourseChanges["renames"] = [];
  const creates: string[] = [];

  for (const { branchId, name } of values.courses) {
    if (!name) {
      continue;
    }

    if (branchId === null) {
      creates.push(name);
    } else if (origin.names.get(branchId) !== name) {
      renames.push({ branchId, name });
    }
  }

  return { term: values.term === origin.term ? null : values.term, renames, creates };
}
