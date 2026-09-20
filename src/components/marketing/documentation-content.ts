import { type LucideIcon, ShieldCheck, Workflow, Wrench } from "lucide-react";

export type HierarchyLevel = {
  name: string;
  description: string;
};

export const HIERARCHY_LEVELS: HierarchyLevel[] = [
  {
    name: "Wing",
    description: "Workspace and profile container for one owner and invited members.",
  },
  {
    name: "Flight",
    description: "Academic term grouping by season and year for timeline-first organization.",
  },
  {
    name: "Branch",
    description: "Course-level container that keeps class notes, tasks, and labels together.",
  },
  {
    name: "Nest",
    description: "Flexible tags for units, assignment types, and custom user workflows.",
  },
  {
    name: "Twig & Feather",
    description: "Twigs are tasks, feathers are markdown notes connected to each class.",
  },
];

export type RoadmapArea = {
  area: string;
  icon: LucideIcon;
  items: string[];
};

export const ROADMAP_AREAS: RoadmapArea[] = [
  {
    area: "Core Application",
    icon: Workflow,
    items: [
      "Zustand split stores for UI state and event data",
      "Strict TypeScript interfaces for encrypted and decrypted payloads",
      "Drag and drop calendar and kanban with @dnd-kit",
    ],
  },
  {
    area: "Real-time Sync",
    icon: Wrench,
    items: [
      "Supabase Postgres and realtime subscriptions",
      "Optimistic concurrency control with field-level merge strategy",
      "Offline persistence for decrypted local state",
    ],
  },
  {
    area: "Encryption and Sharing",
    icon: ShieldCheck,
    items: [
      "Per-course and per-note AES-GCM data keys",
      "Public-key key exchange for secure collaboration",
      "Server and client revocation strategy for roster changes",
    ],
  },
];
