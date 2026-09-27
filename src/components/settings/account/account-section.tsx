import { LocalAccountCard } from "@/components/settings/account/local-account-card";
import { useLocalAccountSettings } from "@/components/settings/account/use-local-account-settings";
import { useLocalAccount } from "@/hooks/use-local-account";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";

type AccountSectionProps = {
  isServerConnected: boolean;
  /** Where to go once the device is erased. */
  onErased: () => void;
};

/** The local account's settings, wired to the hooks they act through. */
export function AccountSection({ isServerConnected, onErased }: AccountSectionProps) {
  const { account, refresh } = useLocalAccount();
  const lock = useWorkspaceLock();
  const settings = useLocalAccountSettings({ refresh, onErased });

  return account ? (
    <LocalAccountCard
      account={account}
      lock={lock}
      settings={settings}
      isServerConnected={isServerConnected}
    />
  ) : null;
}
