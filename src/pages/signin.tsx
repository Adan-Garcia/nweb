import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export function SignInPage() {
  return (
    <AuthShell
      formAriaLabel="Sign in form"
      eyebrow="Beta preview"
      title="Accounts are not live yet."
      description="Sign-in is still being built, so this form does not sign you in anywhere. The planner already works without an account: your notes and deadlines are saved in this browser."
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Private by default",
          copy: "Nothing you write leaves this browser.",
        },
        {
          icon: <LockKeyhole className="size-4" />,
          title: "No account needed",
          copy: "The notes, calendar, and dashboard all work right now.",
        },
      ]}
      form={<LoginForm className="m-0 w-[min(100%,480px)]" />}
    />
  );
}
