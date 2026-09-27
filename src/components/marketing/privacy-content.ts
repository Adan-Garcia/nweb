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
      "Without a sync server: nothing. The planner works entirely in this browser and sends nothing anywhere.",
      "Every device has a local account: your name, your email and a passphrase. The name and email stay in this browser, readable, so the app can greet you before it is unlocked; the passphrase is never stored at all.",
      "A sync account is optional. Creating one on a server — when you sign up, or later in Settings → Sync server — stores your email address and a hash of a key derived from your passphrase there. The passphrase itself never leaves this device.",
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
      "The text of every note, the drawings, the files and the names — note titles, course names, task titles — are encrypted with AES-GCM under a key derived from your passphrase with Argon2id, from the moment your account is created.",
      "Due dates, times and whether a task is done are deliberately left readable, to this browser and to the server. That is what lets a reminder know something is due at nine without anything being able to read what it is.",
      "Nothing can reset your passphrase — not us, and not the server, which never has it. Forget it and the notes cannot be recovered.",
      "You can delete either account from Settings. Deleting the sync account erases everything the server holds for it and keeps your notes on this device; deleting this device's account erases everything in this browser.",
      "Without a sync account, clearing your browser's site data deletes everything. Export a backup from Settings, or add a sync account to keep an encrypted copy on a server.",
    ],
  },
  {
    title: "Who can see it",
    icon: Users,
    items: [
      "Without a sync account, only someone using this browser profile who knows your passphrase.",
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
    copy: "Everything you write is saved by the browser on this device. With no sync account, nothing is uploaded at all.",
  },
  {
    step: "2",
    title: "It is locked",
    copy: "Your account's passphrase encrypts the content and its titles on this device, and is asked for each time the app opens.",
  },
  {
    step: "3",
    title: "Sync is optional, and sealed",
    copy: "Add a sync account to reach your other devices. What the server stores is encrypted before it leaves, and it cannot read it.",
  },
];
