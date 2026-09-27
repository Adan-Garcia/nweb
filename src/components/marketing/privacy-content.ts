import { Database, HardDrive, type LucideIcon, Map, Users } from "lucide-react";

export type PolicySection = {
  title: string;
  icon: LucideIcon;
  items: string[];
};

export const POLICY_SECTIONS: PolicySection[] = [
  {
    title: "What we collect",
    icon: Database,
    items: [
      "Without an account: nothing. The planner works entirely in this browser and sends nothing anywhere.",
      "An account is optional, and only exists when the app is connected to a Cuervo server. Creating one (Settings → Account & sync) stores your email address and a hash of a key derived from your passphrase. The passphrase itself never leaves this device.",
      "Your notes, tasks, files and every name in your workspace are encrypted on this device before they are uploaded. The server stores them and cannot read them.",
      "If you turn on reminders, the server also keeps your browser's push subscription so it can say that something is due.",
      "There is no analytics, no tracking, and no telemetry in the app.",
    ],
  },
  {
    title: "Where your data lives",
    icon: HardDrive,
    items: [
      "Your notes, tasks, files and the courses they are organised under are stored in this browser's IndexedDB. Its local storage holds only small settings: your appearance, how you like to browse notes, and whether the workspace is locked.",
      "Until you set a passphrase or create an account, notes are compressed but not encrypted, so anyone who can open this browser profile can read them.",
      "Set a passphrase in Settings and the text of every note, the drawings, the files and the names — note titles, course names, task titles — are encrypted with AES-GCM under a key derived from it with Argon2id. An account always encrypts.",
      "Due dates, times and whether a task is done are deliberately left readable, to this browser and to the server. That is what lets a reminder know something is due at nine without anything being able to read what it is.",
      "Nothing can reset your passphrase — not us, and not the server, which never has it. Forget it and the notes cannot be recovered.",
      "Without an account, clearing your browser's site data deletes everything. Export a backup from Settings, or create an account to keep an encrypted copy on the server.",
    ],
  },
  {
    title: "Who can see it",
    icon: Users,
    items: [
      "Without an account, only someone using this browser profile.",
      "With one, your own signed-in devices, and anyone you share a course, a unit or a note with — read-only or with edit access, and only what you shared. Removing someone changes the key, so they cannot open anything written after; what they already had stays with them.",
      "Whoever runs the server cannot read your notes, but can see their shape: how many items there are, when they change, when tasks are due, and who has been given access to what.",
      "A reminder cannot say what is due, only that something is and when: the server composing it cannot read the title.",
      "If you use Cuervo Planner on a shared or public computer, lock the workspace or treat your notes as readable by the next person.",
    ],
  },
  {
    title: "What is not built yet",
    icon: Map,
    items: [
      "Deleting an account from inside the app. Signing out removes it from this device; to remove what the server holds, ask whoever runs it.",
      "The sign-in and sign-up pages under /auth are a preview and send nothing. Accounts are created from Settings inside the planner.",
      "Paid plans. Everything is free during the beta, and this page will be updated before any of that changes.",
    ],
  },
];

export type BreakdownStep = {
  step: string;
  title: string;
  copy: string;
};

export const PLAIN_LANGUAGE_STEPS: BreakdownStep[] = [
  {
    step: "1",
    title: "It starts in this browser",
    copy: "Everything you write is saved by the browser on this device. With no account, nothing is uploaded at all.",
  },
  {
    step: "2",
    title: "You can lock it",
    copy: "Without a passphrase your notes are compressed, not encrypted. Set one and the content and its titles are encrypted on this device.",
  },
  {
    step: "3",
    title: "Sync is optional, and sealed",
    copy: "Create an account to reach your other devices. What the server stores is encrypted before it leaves, and it cannot read it.",
  },
];
