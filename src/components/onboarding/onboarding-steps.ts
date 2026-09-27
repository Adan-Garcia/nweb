import { type LucideIcon, NotebookPen, ShieldCheck, Sparkles, Zap } from "lucide-react";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  content: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Cuervo Planner",
    description: "How everything is organised",
    icon: Sparkles,
    content:
      "Everything is filed like a school year. Your wing is the workspace; it holds flights (terms), which hold branches (courses). Inside a course go nests (tags such as units), twigs (tasks), feathers (notes) and pebbles (files).",
  },
  {
    id: "add-courses",
    title: "Add Your Courses",
    description: "Set up your terms and classes",
    icon: Zap,
    content:
      "In Notes, each part of the path bar has an Add option: add a term, then its courses, then any units. Settings → Workspace is where you rename them, give a course a colour, or delete one.",
  },
  {
    id: "plan-and-write",
    title: "Plan and Take Notes",
    description: "Tasks, notes and search",
    icon: NotebookPen,
    content:
      "Add homework and exams on the Calendar or the Board, and write notes as text or on a canvas. Press ⌘K (Ctrl+K on Windows) anywhere to jump to a page, a note or a task.",
  },
  {
    id: "keep-it-safe",
    title: "Keep It Safe",
    description: "Lock, back up, sync",
    icon: ShieldCheck,
    content:
      "Everything on this device is already encrypted under your passphrase, so download a backup now and then. To sync your devices and share a course, add a sync account in Settings → Sync server.",
  },
];
