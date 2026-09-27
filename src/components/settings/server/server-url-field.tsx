import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ServerUrlFieldProps = {
  serverUrl: string | null;
  defaultServerUrl: string | null;
  /** True while on an account: the server cannot change under an account that lives on it. */
  isLocked: boolean;
  isDisabled: boolean;
  onChange: (next: string | null) => void;
  onReset: () => void;
};

/** Which server this device syncs with: any address, the build's default, or none. */
export function ServerUrlField({
  serverUrl,
  defaultServerUrl,
  isLocked,
  isDisabled,
  onChange,
  onReset,
}: ServerUrlFieldProps) {
  const [draft, setDraft] = useState(serverUrl ?? "");
  const canSave = !isLocked && !isDisabled && draft.trim() !== (serverUrl ?? "");

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();

        if (canSave) {
          onChange(draft.trim() ? draft : null);
        }
      }}
    >
      <Label htmlFor="server-url">Server address</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="server-url"
          type="url"
          inputMode="url"
          placeholder="https://sync.example.com"
          className="min-w-0 flex-1"
          value={draft}
          disabled={isLocked || isDisabled}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!canSave}>
          Save
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        {isLocked
          ? "Disconnect from this server before choosing another."
          : serverUrl
            ? "Your own server, or one someone runs for you. Leave it empty for none."
            : "No server: this device keeps everything to itself."}
      </p>
      {!isLocked && defaultServerUrl && serverUrl !== defaultServerUrl ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="w-fit px-0"
          disabled={isDisabled}
          onClick={() => {
            setDraft(defaultServerUrl);
            onReset();
          }}
        >
          Use this app's default server
        </Button>
      ) : null}
    </form>
  );
}
