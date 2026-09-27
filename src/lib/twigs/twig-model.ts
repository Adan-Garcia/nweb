import { z } from "zod";

import { entityBaseSchema } from "../hierarchy/entity-model";

/** Homework types. `docs/hierarchy.md` names the first three; the rest cover what a term needs. */
export const TWIG_KINDS = ["homework", "exam", "essay", "project", "reading", "other"] as const;

export type TwigKind = (typeof TWIG_KINDS)[number];

/**
 * The same three values calendar events used, so the board columns, the status slider and
 * every migrated row agree without a translation table.
 */
export const TWIG_STATUSES = ["incomplete", "inprogress", "complete"] as const;

export type TwigStatus = (typeof TWIG_STATUSES)[number];

export const TWIG_KIND_LABELS: Record<TwigKind, string> = {
  homework: "Homework",
  exam: "Exam",
  essay: "Essay",
  project: "Project",
  reading: "Reading",
  other: "Other",
};

export const TWIG_STATUS_LABELS: Record<TwigStatus, string> = {
  incomplete: "Todo",
  inprogress: "Started",
  complete: "Done",
};

export const twigSchema = entityBaseSchema.extend({
  branchId: z.string(),
  /** Tags, so one twig can sit in several nests. Navigation treats the first as its unit. */
  nestIds: z.array(z.string()).default([]),
  title: z.string(),
  kind: z.enum(TWIG_KINDS).default("homework"),
  /** `YYYY-MM-DD`, or null for a task with no date. Only dated twigs reach the calendar. */
  dueDate: z.string().nullable().default(null),
  /** What the user typed, and what the calendar shows. Free text: "3:30 PM". */
  dueTime: z.string().default(""),
  /**
   * The same time as minutes since midnight, parsed from `dueTime` on write, or null when
   * there was nothing to parse. This is the half a server can schedule from; `dueTime` is
   * the half a person reads. Both stay in the clear on purpose — see `sealed-text.ts`.
   */
  dueMinutes: z.number().int().min(0).max(1439).nullable().default(null),
  /**
   * The IANA zone the wall clock above is a wall clock in. Stored per twig rather than per
   * account, because "the exam is at nine" means nine where it was set.
   */
  timeZone: z.string().default(""),
  status: z.enum(TWIG_STATUSES).default("incomplete"),
  /** Position inside its board column. Sparse, so a drop between two rows needs no rewrite. */
  boardOrder: z.number().default(0),
  /** The feather this task was raised from, when it was created inside a note. */
  featherId: z.string().nullable().default(null),
  /**
   * The calendar feed this task was brought in by (`lib/feeds/`), or null for one typed in
   * by hand. The feed owns the title, date and course of its tasks; status and board order
   * stay the user's.
   */
  feedId: z.string().nullable().default(null),
  /**
   * Shared by every occurrence of a repeating task (`twig-series.ts`), or null for one that
   * does not repeat. Each occurrence is a twig of its own; this is only what ties them.
   */
  seriesId: z.string().nullable().default(null),
});

export type Twig = z.infer<typeof twigSchema>;

/** The gap left between neighbours, so a drop can land halfway without renumbering. */
export const BOARD_ORDER_STEP = 1000;

/**
 * Due first, undated last, and a stable tiebreak on title so two tasks due at the same
 * time do not swap places between renders.
 */
export function compareTwigsByDue(left: Twig, right: Twig) {
  if (left.dueDate === null || right.dueDate === null) {
    if (left.dueDate === right.dueDate) {
      return left.title.localeCompare(right.title);
    }

    return left.dueDate === null ? 1 : -1;
  }

  if (left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }

  return left.title.localeCompare(right.title);
}

export function compareTwigsByBoardOrder(left: Twig, right: Twig) {
  if (left.boardOrder !== right.boardOrder) {
    return left.boardOrder - right.boardOrder;
  }

  return compareTwigsByDue(left, right);
}
