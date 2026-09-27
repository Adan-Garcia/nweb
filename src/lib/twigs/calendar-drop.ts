/** Day droppable ids have to be distinct from twig ids, which are UUIDs. */
const DAY_ID_PREFIX = "day:";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function dayId(dateKey: string) {
  return `${DAY_ID_PREFIX}${dateKey}`;
}

export function dateKeyFromDayId(id: string): string | null {
  if (!id.startsWith(DAY_ID_PREFIX)) {
    return null;
  }

  const dateKey = id.slice(DAY_ID_PREFIX.length);

  return DATE_KEY.test(dateKey) ? dateKey : null;
}

export type CalendarDrop = {
  twigId: string;
  dueDate: string;
};

/**
 * Turns "task X was dropped on a day" into the reschedule to store. Anything dropped
 * somewhere that is not a day, or back onto the day it already had, is no move at all.
 */
export function resolveCalendarDrop({
  activeId,
  overId,
  currentDueDate,
}: {
  activeId: string;
  overId: string | null;
  currentDueDate: string | null;
}): CalendarDrop | null {
  if (!overId) {
    return null;
  }

  const dueDate = dateKeyFromDayId(overId);

  if (!dueDate || dueDate === currentDueDate) {
    return null;
  }

  return { twigId: activeId, dueDate };
}
