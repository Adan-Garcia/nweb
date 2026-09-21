import { z } from "zod";

import { BRANCH_COLORS, type BranchColor } from "@/lib/entity-model";
import { type Twig, TWIG_KINDS, TWIG_STATUSES } from "@/lib/twig-model";
import { findBranch, type WorkspaceSnapshot } from "@/lib/workspace-tree";

/** The dot beside a task takes its colour from the branch the task belongs to. */
export const BRANCH_COLOR_CLASSES: Record<BranchColor, string> = {
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  orange: "bg-orange-500",
  indigo: "bg-indigo-500",
};

/** A twig that has a due date, and so belongs on the calendar. */
export type DatedTwig = Twig & { dueDate: string };

export function isDatedTwig(twig: Twig): twig is DatedTwig {
  return twig.dueDate !== null;
}

export const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const statusOrder: Twig["status"][] = [...TWIG_STATUSES];

export const twigFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
      message: "Enter a valid date",
    }),
  time: z.string().trim().min(1, "Time is required"),
  branchId: z.string().min(1, "Pick a branch"),
  kind: z.enum(TWIG_KINDS),
  status: z.enum(TWIG_STATUSES),
});

export type TwigFormValues = z.infer<typeof twigFormSchema>;

export const STATUS_META: Record<Twig["status"], { label: string; track: string }> = {
  incomplete: {
    label: "Todo",
    track: "bg-slate-300/80 dark:bg-slate-700",
  },
  inprogress: {
    label: "Started",
    track: "bg-amber-300/80 dark:bg-amber-700/80",
  },
  complete: {
    label: "Done",
    track: "bg-emerald-300/80 dark:bg-emerald-700/80",
  },
};

export function branchColorClass(color: BranchColor | undefined) {
  return color ? BRANCH_COLOR_CLASSES[color] : "bg-slate-400";
}

/** The name and dot colour a task shows, read off the branch it belongs to. */
export function branchLabelFor(snapshot: WorkspaceSnapshot, branchId: string) {
  const branch = findBranch(snapshot, branchId);

  return {
    name: branch?.name ?? "No branch",
    colorClass: branchColorClass(branch?.color),
  };
}

export { BRANCH_COLORS };

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date: Date) {
  const value = new Date(date);
  value.setDate(value.getDate() - value.getDay());
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Local midnight of a `YYYY-MM-DD` key (unlike `new Date(key)`, which is UTC). */
export function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

export function formatShortDate(dateKey: string) {
  return dateKeyToDate(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatHumanDate(dateKey: string) {
  const date = dateKeyToDate(dateKey);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
