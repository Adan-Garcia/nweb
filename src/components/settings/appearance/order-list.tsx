import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { moveItem } from "@/lib/reorder";

type OrderListProps<Item> = {
  label: string;
  items: readonly Item[];
  keyOf: (item: Item) => string;
  nameOf: (item: Item) => string;
  /** Anything else on a row, before the arrows: a visibility switch. */
  renderExtra?: (item: Item) => ReactNode;
  onReorder: (items: Item[]) => void;
};

/**
 * A list someone puts in their own order, with up and down buttons rather than dragging:
 * the buttons work the same from a keyboard, a screen reader and a phone.
 */
export function OrderList<Item>({
  label,
  items,
  keyOf,
  nameOf,
  renderExtra,
  onReorder,
}: OrderListProps<Item>) {
  return (
    <ol aria-label={label} className="grid divide-y rounded-lg border">
      {items.map((item, index) => (
        <li key={keyOf(item)} className="flex items-center gap-2 px-3 py-2">
          <span className="w-5 text-caption text-muted-foreground tabular-nums">{index + 1}</span>
          <span className="flex-1 text-body">{nameOf(item)}</span>
          {renderExtra?.(item)}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${nameOf(item)} up`}
            disabled={index === 0}
            onClick={() => onReorder(moveItem(items, index, -1))}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${nameOf(item)} down`}
            disabled={index === items.length - 1}
            onClick={() => onReorder(moveItem(items, index, 1))}
          >
            <ArrowDown />
          </Button>
        </li>
      ))}
    </ol>
  );
}
