import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { unlockSchema, type UnlockValues } from "@/components/auth/signin-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { REMEMBER_DAYS } from "@/lib/lock/remembered-unlock";

type UnlockFormProps = {
  name: string;
  isWorking: boolean;
  error: string | null;
  onSubmit: (values: UnlockValues) => void;
  className?: string;
};

/** Signing in on a device that has its local account: the passphrase, and nothing else. */
export function UnlockForm({ name, isWorking, error, onSubmit, className }: UnlockFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { passphrase: "", remember: false },
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-title">Welcome back, {name}</CardTitle>
        <CardDescription>
          Enter your passphrase to open your notes. It works with no connection at all.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <FieldGroup>
            <Field data-invalid={!!errors.passphrase}>
              <FieldLabel htmlFor="unlock-passphrase">Passphrase</FieldLabel>
              <Input
                {...register("passphrase")}
                id="unlock-passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
              />
              <FieldError errors={[errors.passphrase]} />
            </Field>
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" {...register("remember")} />
              Keep me signed in for {REMEMBER_DAYS} days
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isWorking}>
              {isWorking ? "Signing in…" : "Sign in"}
            </Button>
            <FieldDescription className="text-center">
              Not you? Erasing this device from Settings lets someone else set it up.
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
