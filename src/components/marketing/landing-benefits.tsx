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
  comingSoon?: boolean;
};

const BENEFITS: Benefit[] = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    copy: "Everything you write stays in your browser. There is no server to send it to.",
  },
  {
    icon: Code,
    title: "Open Source",
    copy: "MIT licensed and free to read, fork, or self-host.",
  },
  {
    icon: FileDown,
    title: "Free Beta",
    copy: "Free beta access till 2027.",
  },
  {
    icon: Laptop,
    title: "Works in any browser",
    copy: "Open Cuervo Planner on any modern browser. Installing it as an app is on the way.",
  },
  {
    icon: CloudOff,
    title: "Offline first",
    copy: "Once the page has loaded, the planner keeps working with no connection.",
  },
  {
    icon: LockKeyhole,
    title: "Lock it on this device",
    copy: "Set a passphrase and your notes, drawings and files are encrypted in this browser. Titles stay readable.",
  },
  {
    icon: RefreshCw,
    title: "Fast syncing",
    copy: "Keep the same notes and deadlines on every device you use.",
    comingSoon: true,
  },
  {
    icon: Users,
    title: "Easy sharing",
    copy: "Share your notes and homework with friends, family, or classmates.",
    comingSoon: true,
  },
];

export function LandingBenefits() {
  return (
    <BenefitCards
      label="Features and benefits of using Cuervo Planner"
      className="lg:grid-cols-3 xl:grid-cols-4"
      benefits={BENEFITS.map(({ icon: Icon, title, copy, comingSoon }) => ({
        icon: <Icon className="size-4" />,
        title,
        copy,
        comingSoon,
      }))}
    />
  );
}
