import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AccountReadyCard } from "@/components/auth/account-ready-card";
import { SignupForm } from "@/components/auth/signup-form";
import { useSignup } from "@/components/auth/use-signup";
import { readServerUrl } from "@/lib/api/server-url";

const CARD = "m-0 w-[min(100%,460px)]";

/** Setting up this device's account, or saying it already has one. */
export function SignupPanel() {
  const { device, error, progress, isWorking, submit } = useSignup();
  const [localOnly, setLocalOnly] = useState(false);
  const navigate = useNavigate();

  if (!device) {
    return null;
  }

  if (localOnly) {
    return (
      <AccountReadyCard
        className={CARD}
        title="Your account is ready"
        description="Everything works on this device. Sync can wait."
        notice={error}
        to="/auth/onboarding"
        action="Continue"
      />
    );
  }

  if (device.hasLocalAccount) {
    return (
      <AccountReadyCard
        className={CARD}
        title="This device already has an account"
        description="Each device has one. Sign in with its passphrase to open it."
        to="/auth/signin"
        action="Sign in"
      />
    );
  }

  return (
    <SignupForm
      className={CARD}
      hasPassphrase={device.hasPassphrase}
      defaultServerUrl={readServerUrl() ?? ""}
      isWorking={isWorking}
      progress={progress}
      error={error}
      onSubmit={(values) => {
        void submit(values).then((outcome) => {
          if (outcome === "done") {
            void navigate("/auth/onboarding");
          } else if (outcome === "local-only") {
            setLocalOnly(true);
          }
        });
      }}
    />
  );
}
