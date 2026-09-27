import { useState } from "react";
import { Lock } from "lucide-react";

import { RekeyProgressBar } from "@/components/lock/rekey-progress";
import { ChangePassphraseField } from "@/components/settings/account/change-passphrase-field";
import { EraseDeviceForm } from "@/components/settings/account/erase-device-form";
import { ProfileForm } from "@/components/settings/account/profile-form";
import type { useLocalAccountSettings } from "@/components/settings/account/use-local-account-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { useWorkspaceLock } from "@/hooks/use-workspace-lock";
import type { LocalAccount } from "@/lib/account/local-account";

type LocalAccountCardProps = {
  account: LocalAccount;
  lock: ReturnType<typeof useWorkspaceLock>;
  settings: ReturnType<typeof useLocalAccountSettings>;
  isServerConnected: boolean;
};

/** The account every device has: who it is, its passphrase, and erasing it. */
export function LocalAccountCard({
  account,
  lock,
  settings,
  isServerConnected,
}: LocalAccountCardProps) {
  const [isChanging, setIsChanging] = useState(false);
  const error = settings.error ?? lock.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          This device's account. Its passphrase encrypts everything here and is asked for each time
          the app opens.
          {isServerConnected ? " It is also your sync account's passphrase." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ProfileForm
          key={account.updatedAt}
          profile={account}
          onSave={(profile) => void settings.saveProfile(profile)}
        />

        <Separator />

        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={lock.isWorking}
              onClick={() => setIsChanging(!isChanging)}
            >
              Change passphrase
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={lock.isWorking}
              onClick={() => void lock.lock()}
            >
              <Lock className="size-4" />
              Lock now
            </Button>
          </div>
          {isChanging ? (
            <ChangePassphraseField
              isDisabled={lock.isWorking}
              onSubmit={(current, next) => {
                void lock.change(current, next);
                setIsChanging(false);
              }}
              onCancel={() => setIsChanging(false)}
            />
          ) : null}
          <RekeyProgressBar progress={lock.progress} label="Re-encrypting" />
          <p className="text-caption text-muted-foreground">
            Encrypted: the text of every note, the drawings, the files, and every name. Left
            readable: due dates and times, so a reminder knows when without knowing what. Nothing
            can reset the passphrase.
          </p>
        </div>

        <Separator />

        <EraseDeviceForm
          isServerConnected={isServerConnected}
          isDisabled={settings.isWorking}
          onErase={(passphrase, alsoServer) => void settings.erase(passphrase, alsoServer)}
        />

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
