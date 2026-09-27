import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export function SignInPage() {
  return (
    <AuthShell
      formAriaLabel="Sign in form"
      eyebrow="Beta preview"
      title="Sign in from inside the planner."
      description="This page is a preview and does not sign you in. Accounts live in the planner itself: open Settings, then Account & sync, to sign in on this device or create an account. You do not need one to start — your notes and deadlines are saved in this browser."
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Private by default",
          copy: "Without an account, nothing you write leaves this browser.",
        },
        {
          icon: <LockKeyhole className="size-4" />,
          title: "No account needed",
          copy: "Notes, calendar, board and dashboard all work without one.",
        },
      ]}
      form={<LoginForm className="m-0 w-[min(100%,480px)]" />}
    />
  );
}
