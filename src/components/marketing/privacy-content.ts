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
      "Nothing. Cuervo Planner has no server and no accounts, so there is nowhere to send your data and no one to send it to.",
      "The sign-in and sign-up forms do not create an account yet. They check that what you typed is well formed and go no further.",
      "There is no analytics, no tracking, and no telemetry in the app.",
    ],
  },
  {
    title: "Where your data lives",
    icon: HardDrive,
    items: [
      "Your notes are stored in this browser's IndexedDB, and your calendar events in its local storage. Both stay on this device.",
      "Until you set a passphrase, notes are compressed but not encrypted, so anyone who can open this browser profile can read them.",
      "Set one in Settings and the text of every note, the drawings and the files are encrypted with AES-GCM under a key derived from it. Note titles, course names and due dates stay readable.",
      "Nothing can reset that passphrase: there is no account and no server. Forget it and the notes cannot be recovered.",
      "Clearing your browser's site data deletes everything, and there is no copy anywhere else.",
    ],
  },
  {
    title: "Who can see it",
    icon: Users,
    items: [
      "Only someone using this browser profile. There is no sharing and no collaboration.",
      "Nothing is transmitted, so there is nothing to intercept in the first place.",
      "If you use Cuervo Planner on a shared or public computer, treat your notes as readable by the next person.",
    ],
  },
  {
    title: "What is not built yet",
    icon: Map,
    items: [
      "Accounts, sync between devices and sharing are on the roadmap and are not implemented today.",
      "Until they exist, no part of this app can promise them, whatever a feature list elsewhere might suggest.",
      "This page will be rewritten before any of them ship. The planned order is on the documentation page.",
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
    title: "It stays in this browser",
    copy: "Everything you write is saved by the browser on this device. There is no server to send it to.",
  },
  {
    step: "2",
    title: "You can lock it",
    copy: "Without a passphrase your notes are compressed, not encrypted, and anyone who can open this browser profile can read them. Set one and the content is encrypted on this device.",
  },
  {
    step: "3",
    title: "It is the only copy",
    copy: "Clear your site data or lose the device and the notes are gone. Nothing is backed up anywhere else.",
  },
];
