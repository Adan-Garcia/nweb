import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export function SignupPage() {
  return (
    <AuthShell
      formAriaLabel="Sign up form"
      eyebrow="Join the beta"
      title="Plan your classes, notes, and deadlines in one place."
      description="Accounts are still being built, so this form does not create one yet. The planner is already usable without it: your coursework is stored locally on your device, and the core planner will stay free and open source."
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
      form={<SignupForm className="m-0 w-[min(100%,430px)]" />}
    />
  );
}
