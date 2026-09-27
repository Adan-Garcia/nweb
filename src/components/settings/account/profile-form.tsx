import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LocalAccountProfile } from "@/lib/account/local-account";

type ProfileFormProps = {
  profile: LocalAccountProfile;
  onSave: (profile: LocalAccountProfile) => void;
};

/** The name the app greets you by, and the address a server account would use. */
export function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const isChanged = name.trim() !== profile.name || email.trim() !== profile.email;
  const canSave = isChanged && name.trim().length > 0 && email.includes("@");

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();

        if (canSave) {
          onSave({ name: name.trim(), email: email.trim() });
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input
          id="profile-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" disabled={!canSave}>
          Save
        </Button>
      </div>
    </form>
  );
}
