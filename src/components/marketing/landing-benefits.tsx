import { LockKeyhole, type LucideIcon, ShieldCheck } from "lucide-react";

type Benefit = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    copy: "Your wings stay locked to your account.",
  },
  {
    icon: LockKeyhole,
    title: "Fast syncing",
    copy: "Quickly sync your data across all your devices.",
  },
  {
    icon: LockKeyhole,
    title: "Open Source",
    copy: "Open Source, forever.",
  },
  {
    icon: LockKeyhole,
    title: "Free Beta",
    copy: "Free beta access till 2027.",
  },
  {
    icon: LockKeyhole,
    title: "Device Level Encryption",
    copy: "Your data is encrypted at the device level, ensuring maximum security.",
  },
  {
    icon: LockKeyhole,
    title: "Easy sharing",
    copy: "share your notes and homework with your friends, family, or classmates",
  },
  {
    icon: LockKeyhole,
    title: "Cross platform",
    copy: "Access Cuervo Planner on all your devices, seamlessly.",
  },
  {
    icon: LockKeyhole,
    title: "Offline first",
    copy: "Use Cuervo Planner even without an internet connection, your data will sync once you're back online.",
  },
];

export function LandingBenefits() {
  return (
    <div className="signin-points" aria-label="Features and benefits of using Cuervo Planner">
      {BENEFITS.map(({ icon: Icon, title, copy }) => (
        <div className="signin-point" key={title}>
          <span className="signin-point-badge">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="signin-point-title">{title}</p>
            <p className="signin-point-copy">{copy}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
