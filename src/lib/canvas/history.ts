import type { SceneElement } from "./scene-model";

/**
 * Undo and redo for one note on one device. A step is what one action changed: each
 * element as it was before and after (null where it did not exist). Kept per device and
 * never synced, because one device's steps mean nothing on another (`docs/canvas.md`,
 * "Undo history").
 */
export type HistoryChange = { id: string; before: SceneElement | null; after: SceneElement | null };

export type HistoryStep = { changes: HistoryChange[] };

export type History = { undo: HistoryStep[]; redo: HistoryStep[] };

export const HISTORY_LIMIT = 200;

export const EMPTY_HISTORY: History = { undo: [], redo: [] };

/** What changed between two lists of elements, by id and version. */
export function diffElements(
  before: readonly SceneElement[],
  after: readonly SceneElement[],
): HistoryStep {
  const beforeById = new Map(before.map((element) => [element.id, element]));
  const afterById = new Map(after.map((element) => [element.id, element]));
  const changes: HistoryChange[] = [];

  for (const [id, was] of beforeById) {
    const now = afterById.get(id) ?? null;
    if (!now || now.version !== was.version) {
      changes.push({ id, before: was, after: now });
    }
  }
  for (const [id, now] of afterById) {
    if (!beforeById.has(id)) {
      changes.push({ id, before: null, after: now });
    }
  }

  return { changes };
}

/** Adds a step to undo, forgetting redo and the oldest steps past the limit. */
export function recordStep(history: History, step: HistoryStep, limit = HISTORY_LIMIT): History {
  if (!step.changes.length) {
    return history;
  }

  return { undo: [...history.undo, step].slice(-limit), redo: [] };
}

/**
 * Reverts one step: every element it changed goes back to its `before`. A change is
 * skipped when the element is no longer as the step left it (changed since, by sync or by
 * this device), so undo never reverts someone else's work. The inverse of what was applied
 * comes back, to be pushed on the other stack; reverting it is the redo.
 *
 * A restored element gets a version above both sides, never its old one: the merge takes
 * the higher version, and an undo written back at an old version would lose to the edit
 * it is undoing.
 */
function revertStep(
  elements: readonly SceneElement[],
  step: HistoryStep,
): { elements: SceneElement[]; inverse: HistoryStep } {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const inverse: HistoryChange[] = [];

  for (const change of step.changes) {
    const current = byId.get(change.id) ?? null;
    if ((current?.version ?? null) !== (change.after?.version ?? null)) {
      continue;
    }

    const restored = change.before
      ? { ...change.before, version: Math.max(change.before.version, current?.version ?? 0) + 1 }
      : null;
    if (restored) {
      byId.set(change.id, restored);
    } else {
      byId.delete(change.id);
    }
    inverse.push({ id: change.id, before: current, after: restored });
  }

  return { elements: [...byId.values()], inverse: { changes: inverse } };
}

/**
 * Reverts the newest step on `stack` that still applies. Steps whose every change has been
 * overtaken are dropped on the way, since there is nothing left in them to revert.
 */
function revertLatest(stack: readonly HistoryStep[], elements: readonly SceneElement[]) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const reverted = revertStep(elements, stack[i]);
    if (reverted.inverse.changes.length) {
      return { ...reverted, remaining: stack.slice(0, i) };
    }
  }

  return null;
}

type Moved = { history: History; elements: SceneElement[] } | null;

/** Undoes the latest step that still applies; null when nothing can be undone. */
export function undo(history: History, elements: readonly SceneElement[]): Moved {
  const reverted = revertLatest(history.undo, elements);

  return (
    reverted && {
      elements: reverted.elements,
      history: { undo: reverted.remaining, redo: [...history.redo, reverted.inverse] },
    }
  );
}

/** Redoes the latest undone step that still applies; null when there is none. */
export function redo(history: History, elements: readonly SceneElement[]): Moved {
  const reverted = revertLatest(history.redo, elements);

  return (
    reverted && {
      elements: reverted.elements,
      history: { undo: [...history.undo, reverted.inverse], redo: reverted.remaining },
    }
  );
}
