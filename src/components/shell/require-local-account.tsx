import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { RouteFallback } from "@/components/layout/route-fallback";
import { useLocalAccount } from "@/hooks/use-local-account";

/**
 * The workspace opens only on a device with its local account. One without is sent to set
 * it up — which, on a device from before local accounts, keeps the notes and passphrase it
 * has and only asks for a name and an email.
 */
export function RequireLocalAccount({ children }: { children: ReactNode }) {
  const { status } = useLocalAccount();

  if (status === "loading") {
    return <RouteFallback />;
  }

  if (status === "none") {
    return <Navigate to="/auth/signup" replace />;
  }

  return children;
}
