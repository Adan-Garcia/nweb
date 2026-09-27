import { Laptop, type LucideIcon, Moon, MoonStar, ScrollText, Sun } from "lucide-react";

import type {
  Accent,
  DashboardCardId,
  Density,
  FontSize,
  SidebarMode,
  ThemeMode,
} from "@/lib/preferences-model";

/** What each preference is called on screen. The values themselves are `preferences-model`'s. */
export type ThemeOption = { value: ThemeMode; label: string; icon: LucideIcon };

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "system", label: "System", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "paper", label: "Paper", icon: ScrollText },
  { value: "oled", label: "Black", icon: MoonStar },
];

export const ACCENT_LABELS: Record<Accent, string> = {
  rose: "Rose",
  orange: "Orange",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
};

export const DENSITY_LABELS: Record<Density, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  sm: "Small",
  md: "Default",
  lg: "Large",
};

export const DASHBOARD_CARD_LABELS: Record<DashboardCardId, string> = {
  "next-priority": "Next priority",
  stats: "Stats",
  upcoming: "Upcoming deadlines",
  "recent-notes": "Recent notes",
};

export const SIDEBAR_LABELS: Record<SidebarMode, string> = {
  expanded: "Expanded",
  icons: "Icons only",
};
