import type { Twig } from "./twig-model";
import { branchPath, type WorkspaceSnapshot } from "./workspace-tree";

/** How urgent an item is. The order here is the order they are listed in. */
export const NOTIFICATION_KINDS = ["overdue", "today", "soon"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  overdue: "Overdue",
  today: "Due today",
  soon: "Due soon",
};

export type WorkspaceNotification = {
  /** The twig's id, so opening one can go straight to it. */
  id: string;
  kind: NotificationKind;
  title: string;
  branchName: string;
  dueDate: string;
  dueTime: string;
};

/** How far ahead "due soon" reaches, in days. */
export const SOON_WINDOW_DAYS = 7;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * What the bell has to say: the dated, unfinished tasks that are late, due today, or due
 * inside the next week.
 *
 * Dates are compared as `YYYY-MM-DD` keys rather than as `Date`s, which keeps the whole
 * thing on calendar days and out of the timezone question that `new Date(key)` opens.
 */
export function buildNotifications(
  twigs: Twig[],
  snapshot: WorkspaceSnapshot,
  now = new Date(),
): WorkspaceNotification[] {
  const todayKey = dateKey(now);
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + SOON_WINDOW_DAYS);
  const horizonKey = dateKey(horizon);

  const notifications = twigs.flatMap((twig): WorkspaceNotification[] => {
    if (twig.status === "complete" || twig.dueDate === null || twig.deletedAt) {
      return [];
    }

    const kind = classify(twig.dueDate, todayKey, horizonKey);

    if (!kind) {
      return [];
    }

    return [
      {
        id: twig.id,
        kind,
        title: twig.title,
        branchName: branchPath(snapshot, twig.branchId)?.branch.name ?? "No branch",
        dueDate: twig.dueDate,
        dueTime: twig.dueTime,
      },
    ];
  });

  return notifications.sort(compareNotifications);
}

function classify(dueDate: string, todayKey: string, horizonKey: string): NotificationKind | null {
  if (dueDate < todayKey) {
    return "overdue";
  }

  if (dueDate === todayKey) {
    return "today";
  }

  return dueDate <= horizonKey ? "soon" : null;
}

/** Most urgent first; inside a group, the oldest due date, then the title. */
function compareNotifications(left: WorkspaceNotification, right: WorkspaceNotification) {
  if (left.kind !== right.kind) {
    return NOTIFICATION_KINDS.indexOf(left.kind) - NOTIFICATION_KINDS.indexOf(right.kind);
  }

  if (left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }

  return left.title.localeCompare(right.title);
}

/**
 * The number on the bell. Only what is late or due today counts: a badge that also
 * counted next week's work would never be clear, and would stop meaning anything.
 */
export function countUrgent(notifications: WorkspaceNotification[]) {
  return notifications.filter((item) => item.kind !== "soon").length;
}
