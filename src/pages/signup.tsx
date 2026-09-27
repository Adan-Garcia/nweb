import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupPanel } from "@/components/auth/signup-panel";

export function SignupPage() {
  return (
    <AuthShell
      formAriaLabel="Sign up form"
      eyebrow="Create your account"
      title="Plan your classes, notes, and deadlines in one place."
      description="Your account lives on this device: a name, an email and a passphrase that encrypts everything you write. A sync server is optional — add one now or later in Settings to keep your other devices up to date."
      benefits={[
        {
          icon: <ShieldCheck className="size-4" />,
          title: "Local-first",
          copy: "Your notes and deadlines are stored and encrypted on your device, and synced only if you choose.",
        },
        {
          icon: <LockKeyhole className="size-4" />,
          title: "One passphrase",
          copy: "It unlocks this device and, if you add one, your sync account. Nobody can reset it.",
        },
      ]}
      form={<SignupPanel />}
    />
  );
}
