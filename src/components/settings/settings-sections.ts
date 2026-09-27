import {
  Bell,
  CalendarSync,
  Database,
  FolderTree,
  type LucideIcon,
  Palette,
  Server,
  Share2,
  UserRound,
} from "lucide-react";

export type SettingsSection = { id: string; label: string; icon: LucideIcon };

/** The settings page, in the order it reads. Ids are the anchors `/settings#…` links to. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserRound },
  { id: "sync", label: "Sync server", icon: Server },
  { id: "workspace", label: "Workspace", icon: FolderTree },
  { id: "feeds", label: "Calendar feeds", icon: CalendarSync },
  { id: "backup", label: "Backup", icon: Database },
  { id: "sharing", label: "Sharing", icon: Share2 },
  { id: "reminders", label: "Reminders", icon: Bell },
];
