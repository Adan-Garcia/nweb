import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/signup-form";

import "../App.css";

export function SignupPage() {
  return (
    <AuthShell
      pageClassName="signin-page"
      shellClassName="signin-shell"
      brandClassName="signin-brand"
      copyClassName="signin-copy"
      formPanelClassName="signin-form-panel"
      formAriaLabel="Sign up form"
      eyebrow="Join the beta"
      title="Plan your classes, notes, and deadlines in one place."
      description="Create a free account to organize your coursework. Your data is stored locally on your device, and the core planner will stay free and open source."
      benefitsClassName="signin-points"
      benefitClassName="signin-point"
      benefitBadgeClassName="signin-point-badge"
      benefitTitleClassName="signin-point-title"
      benefitCopyClassName="signin-point-copy"
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Local-first",
          copy: "Your notes and deadlines are stored on your device.",
        },
        {
          icon: <LockKeyhole className="size-4" />,
          title: "Free during the beta",
          copy: "Free beta access through 2027.",
        },
      ]}
      form={<SignupForm className="signup-card" />}
    />
  );
}
