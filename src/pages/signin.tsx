import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SigninPanel } from "@/components/auth/signin-panel";

export function SignInPage() {
  return (
    <AuthShell
      formAriaLabel="Sign in form"
      eyebrow="Sign in"
      title="Pick up where you left off."
      description="On a device you have used before, your passphrase opens your notes with no connection needed. On a new one, sign in to your sync account to bring your notes across."
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Works offline",
          copy: "Signing in on this device never waits for a server.",
        },
        {
          icon: <LockKeyhole className="size-4" />,
          title: "End-to-end encrypted",
          copy: "A sync server only ever holds ciphertext it cannot read.",
        },
      ]}
      form={<SigninPanel />}
    />
  );
}
