import {
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Notebook,
} from "lucide-react";

import type { NavId } from "@/lib/preferences-model";

export type WorkspaceNavItem = {
  id: NavId;
  title: string;
  url: string;
  icon: LucideIcon;
};

export const NAVIGATION_ITEMS: WorkspaceNavItem[] = [
  { id: "dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { id: "calendar", title: "Calendar", url: "/calendar", icon: CalendarDays },
  { id: "board", title: "Board", url: "/board", icon: KanbanSquare },
  { id: "notes", title: "Notes", url: "/notes", icon: Notebook },
];

/** The nav in the order someone arranged it. The order is already normalised by the model. */
export function orderNavItems(order: readonly NavId[]): WorkspaceNavItem[] {
  return order.flatMap((id) => NAVIGATION_ITEMS.filter((item) => item.id === id));
}
