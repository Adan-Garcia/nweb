import {
  BellRing,
  CalendarSync,
  GraduationCap,
  type LucideIcon,
  Palette,
  Sparkles,
} from "lucide-react";

export type OnboardingStepId = "welcome" | "courses" | "calendar" | "appearance" | "sync";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Setting a new workspace up, one thing at a time. Every step after the first does the
 * setting up itself, and any of it can be skipped: each has a home in Settings to come back
 * to, which the step says.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "How everything is organised",
    icon: Sparkles,
  },
  {
    id: "courses",
    title: "Your term and courses",
    description: "What you are taking this term",
    icon: GraduationCap,
  },
  {
    id: "calendar",
    title: "Bring in your calendar",
    description: "Import deadlines from Brightspace, Canvas or Google",
    icon: CalendarSync,
  },
  {
    id: "appearance",
    title: "Make it yours",
    description: "Theme, colour and spacing",
    icon: Palette,
  },
  {
    id: "sync",
    title: "Sync and reminders",
    description: "Your other devices, and a nudge when something is due",
    icon: BellRing,
  },
];
