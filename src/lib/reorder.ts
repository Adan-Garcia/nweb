/**
 * Moves one item by `delta` places, clamped to the ends. Returns the list unchanged (as a
 * copy) when the move would go nowhere, so a caller can compare and skip a write.
 */
export function moveItem<Item>(list: readonly Item[], index: number, delta: number): Item[] {
  const next = [...list];
  const target = Math.min(Math.max(index + delta, 0), list.length - 1);

  if (index < 0 || index >= list.length || target === index) {
    return next;
  }

  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);

  return next;
}
