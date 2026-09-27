import {
  CalendarDays,
  type LucideIcon,
  Map as MapIcon,
  NotebookPen,
  ShieldCheck,
} from "lucide-react";

export type HierarchyLevel = {
  name: string;
  description: string;
};

export const HIERARCHY_LEVELS: HierarchyLevel[] = [
  {
    name: "Wing",
    description: "Your workspace. Everything you own sits in one wing.",
  },
  {
    name: "Flight",
    description: "An academic term, named by season and year, so each semester has its own shelf.",
  },
  {
    name: "Branch",
    description: "A course. Its notes, tasks, units and files live together under it.",
  },
  {
    name: "Nest",
    description:
      "A tag within a course: a unit, an assignment type, whatever you group by. One item can carry several.",
  },
  {
    name: "Twig & Feather",
    description:
      "Twigs are tasks — homework, exams, essays. Feathers are notes: rich text, an infinite canvas, or both.",
  },
  {
    name: "Pebble",
    description: "A file: the PDFs and images you bring into a note.",
  },
];

export type FeatureArea = {
  area: string;
  icon: LucideIcon;
  description: string;
  items: string[];
};

export const FEATURE_AREAS: FeatureArea[] = [
  {
    area: "Planning",
    icon: CalendarDays,
    description: "Built and working today.",
    items: [
      "A calendar with month and week views; drag a task onto another day to move it",
      "A board with Todo, Started and Done columns; drag a card to reorder or move it",
      "A dashboard of what is due today, what is overdue and what you edited lately",
      "Reminders while the app is open, and push reminders with an account",
    ],
  },
  {
    area: "Notes",
    icon: NotebookPen,
    description: "Built and working today.",
    items: [
      "Linear notes in a rich-text editor",
      "Spatial notes on an infinite canvas, with PDF import and image drop",
      "Browse by path or as a tree, and find any note or task with ⌘K",
      "Everything saves as you type, and keeps working offline",
    ],
  },
  {
    area: "Privacy and sync",
    icon: ShieldCheck,
    description: "Built and working today.",
    items: [
      "A passphrase lock: AES-GCM under an Argon2id key, titles included",
      "Backups you can download, encrypt, and restore or merge",
      "An optional account for encrypted sync between your devices",
      "Share a course, unit or note, read-only or editable, and take it back",
    ],
  },
  {
    area: "Still to come",
    icon: MapIcon,
    description: "Known gaps, in no particular order.",
    items: [
      "Deleting an account from inside the app",
      "Two people rewriting the same words at once (edits to different words already merge)",
      "Cleaning up the grants on a key once it has been rotated",
      "Paid hosting plans",
    ],
  },
];
