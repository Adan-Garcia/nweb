import {
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Notebook,
} from "lucide-react";

export type WorkspaceNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

export const NAVIGATION_ITEMS: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Calendar",
    url: "/calendar",
    icon: CalendarDays,
  },
  {
    title: "Board",
    url: "/board",
    icon: KanbanSquare,
  },
  {
    title: "Notes",
    url: "/notes",
    icon: Notebook,
  },
];
