import {
  Bell,
  Database,
  FolderTree,
  KeyRound,
  type LucideIcon,
  Palette,
  Share2,
  UserRound,
} from "lucide-react";

export type SettingsSection = { id: string; label: string; icon: LucideIcon };

/** The settings page, in the order it reads. Ids are the anchors `/settings#…` links to. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "workspace", label: "Workspace", icon: FolderTree },
  { id: "security", label: "Security", icon: KeyRound },
  { id: "backup", label: "Backup", icon: Database },
  { id: "account", label: "Account & sync", icon: UserRound },
  { id: "sharing", label: "Sharing", icon: Share2 },
  { id: "reminders", label: "Reminders", icon: Bell },
];
