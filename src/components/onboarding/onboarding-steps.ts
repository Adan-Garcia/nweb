import { CheckCircle2, Sparkles, Users, Zap, type LucideIcon } from "lucide-react"

export type OnboardingStep = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  content: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Cuervo Planner",
    description: "Let's set up your workspace",
    icon: Sparkles,
    content:
      "You've successfully created your account. Now let's personalize your experience and get you started.",
  },
  {
    id: "create-wing",
    title: "Create Your First Wing",
    description: "Start building something amazing",
    icon: Zap,
    content: "Wings are the foundation of your work. Create your first wing to start organizing.",
  },
  {
    id: "invite-flock",
    title: "Invite Your Flock",
    description: "Collaborate with others",
    icon: Users,
    content:
      "Add flock members, set permissions, and start collaborating in real-time in wings.",
  },
  {
    id: "ready",
    title: "You're All Set!",
    description: "Ready to launch",
    icon: CheckCircle2,
    content: "Everything is ready. Head to your dashboard to see your wings and start building.",
  },
]
