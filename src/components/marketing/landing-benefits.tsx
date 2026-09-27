import {
  CloudOff,
  Code,
  FileDown,
  Laptop,
  LockKeyhole,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { BenefitCards } from "@/components/auth/benefit-cards";

type Benefit = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    copy: "Without an account, everything you write stays in this browser and nothing is uploaded.",
  },
  {
    icon: Code,
    title: "Open Source",
    copy: "MIT licensed and free to read, fork, or self-host, server included.",
  },
  {
    icon: FileDown,
    title: "Free Beta",
    copy: "Every feature is free during the beta, through 2027.",
  },
  {
    icon: Laptop,
    title: "Install it like an app",
    copy: "Runs in any modern browser, and installs to your home screen or dock from there.",
  },
  {
    icon: CloudOff,
    title: "Offline first",
    copy: "Once it has loaded, the planner keeps working with no connection, account or not.",
  },
  {
    icon: LockKeyhole,
    title: "Lock it on this device",
    copy: "Set a passphrase and your notes, drawings, files and their titles are encrypted in this browser. Due dates stay readable so reminders can work.",
  },
  {
    icon: RefreshCw,
    title: "Sync across devices",
    copy: "Create an optional account to keep notes and deadlines in step on every device. The server stores them encrypted and cannot read them.",
  },
  {
    icon: Users,
    title: "Share a course",
    copy: "Give a classmate read or edit access to one course, unit or note, and nothing else.",
  },
];

export function LandingBenefits() {
  return (
    <BenefitCards
      label="Features and benefits of using Cuervo Planner"
      className="lg:grid-cols-3 xl:grid-cols-4"
      benefits={BENEFITS.map(({ icon: Icon, title, copy }) => ({
        icon: <Icon className="size-4" />,
        title,
        copy,
      }))}
    />
  );
}
