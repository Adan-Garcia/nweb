import { useState } from "react";
import type { ShareRole } from "@shared/sharing-contract";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ShareFormProps = {
  isDisabled: boolean;
  onSubmit: (email: string, role: ShareRole) => void;
};

/** An address and what they may do with it. Reading is the hard part; writing is a check. */
export function ShareForm({ isDisabled, onSubmit }: ShareFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("reader");

  return (
    <form
      className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (email.includes("@")) {
          onSubmit(email, role);
          setEmail("");
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="share-email">Share with</Label>
        <Input
          id="share-email"
          type="email"
          autoComplete="off"
          placeholder="them@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
          }}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">What they can do</legend>
        {(["reader", "writer"] as const).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="share-role"
              value={option}
              checked={role === option}
              onChange={() => {
                setRole(option);
              }}
            />
            {option === "reader" ? "Read it" : "Read and change it"}
          </label>
        ))}
      </fieldset>

      <div>
        <Button type="submit" size="sm" disabled={isDisabled || !email.includes("@")}>
          Share
        </Button>
      </div>
    </form>
  );
}
