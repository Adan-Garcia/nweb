import { Navigate, useNavigate } from "react-router-dom";

import { AccountReadyCard } from "@/components/auth/account-ready-card";
import { ServerSigninForm } from "@/components/auth/server-signin-form";
import { UnlockForm } from "@/components/auth/unlock-form";
import { useSignin } from "@/components/auth/use-signin";
import { readServerUrl } from "@/lib/api/server-url";

const CARD = "m-0 w-[min(100%,460px)]";

/** Whichever sign-in this device needs: none, its passphrase, or a server account. */
export function SigninPanel() {
  const { device, error, isWorking, unlock, signIn } = useSignin();
  const navigate = useNavigate();

  if (!device) {
    return null;
  }

  if (device.state === "needs-setup") {
    return <Navigate to="/auth/signup" replace />;
  }

  if (device.state === "open") {
    return (
      <AccountReadyCard
        className={CARD}
        title={`You're signed in, ${device.account?.name ?? ""}`}
        description="This device is unlocked."
        to="/dashboard"
        action="Open the planner"
      />
    );
  }

  if (device.state === "locked" && device.account) {
    return (
      <UnlockForm
        className={CARD}
        name={device.account.name}
        isWorking={isWorking}
        error={error}
        onSubmit={({ passphrase, remember }) => {
          void unlock(passphrase, remember).then((opened) => {
            if (opened) {
              void navigate("/dashboard");
            }
          });
        }}
      />
    );
  }

  return (
    <ServerSigninForm
      className={CARD}
      defaultServerUrl={readServerUrl() ?? ""}
      hasContent={device.hasContent}
      isWorking={isWorking}
      error={error}
      onSubmit={(values, mode) => {
        void signIn(values, mode).then((signedIn) => {
          if (signedIn) {
            void navigate("/dashboard");
          }
        });
      }}
    />
  );
}
