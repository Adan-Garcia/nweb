import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export function SignupPage() {
  return (
    <AuthShell
      formAriaLabel="Sign up form"
      eyebrow="Join the beta"
      title="Plan your classes, notes, and deadlines in one place."
      description="This form is a preview and does not create an account. To make one, open the planner and go to Settings, then Account & sync. You can start without one: your coursework is stored on this device, and the planner stays free and open source."
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Local-first",
          copy: "Your notes and deadlines are stored on your device, and synced only if you choose.",
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
