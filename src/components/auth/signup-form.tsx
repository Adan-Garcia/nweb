import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { signupSchema, type SignupValues } from "@/components/auth/signup-schema";
import { RekeyProgressBar } from "@/components/lock/rekey-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

type SignupFormProps = {
  /** True on a device from before local accounts: its passphrase is asked for, not chosen. */
  hasPassphrase: boolean;
  defaultServerUrl: string;
  isWorking: boolean;
  progress: RekeyProgress | null;
  error: string | null;
  onSubmit: (values: SignupValues) => void;
  className?: string;
};

/** The local account — name, email, passphrase — and, if wanted, a sync account with it. */
export function SignupForm({
  hasPassphrase,
  defaultServerUrl,
  isWorking,
  progress,
  error,
  onSubmit,
  className,
}: SignupFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema(hasPassphrase)),
    defaultValues: {
      name: "",
      email: "",
      passphrase: "",
      confirmPassphrase: "",
      withServer: false,
      serverUrl: defaultServerUrl,
    },
  });
  const withServer = useWatch({ control, name: "withServer" });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-title">Create your account</CardTitle>
        <CardDescription>
          {hasPassphrase
            ? "This device already has notes and a passphrase. Add your name and email to keep using them."
            : "It lives on this device. The passphrase encrypts everything you write here."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* The values are never logged: they hold the passphrase. */}
        <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input {...register("name")} id="name" autoComplete="name" />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input {...register("email")} id="email" type="email" autoComplete="email" />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.passphrase}>
              <FieldLabel htmlFor="passphrase">
                {hasPassphrase ? "This device's passphrase" : "Passphrase"}
              </FieldLabel>
              <Input
                {...register("passphrase")}
                id="passphrase"
                type="password"
                autoComplete={hasPassphrase ? "current-password" : "new-password"}
              />
              <FieldError errors={[errors.passphrase]} />
              <FieldDescription>
                Nothing can reset it — not us, and not a server. Forget it and the notes are gone.
              </FieldDescription>
            </Field>
            {hasPassphrase ? null : (
              <Field data-invalid={!!errors.confirmPassphrase}>
                <FieldLabel htmlFor="confirm-passphrase">Confirm passphrase</FieldLabel>
                <Input
                  {...register("confirmPassphrase")}
                  id="confirm-passphrase"
                  type="password"
                  autoComplete="new-password"
                />
                <FieldError errors={[errors.confirmPassphrase]} />
              </Field>
            )}
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" {...register("withServer")} />
              Also create a sync account on a server
            </label>
            {withServer ? (
              <Field data-invalid={!!errors.serverUrl}>
                <FieldLabel htmlFor="server-url">Server address</FieldLabel>
                <Input {...register("serverUrl")} id="server-url" type="url" inputMode="url" />
                <FieldError errors={[errors.serverUrl]} />
              </Field>
            ) : null}
            <RekeyProgressBar progress={progress} label="Encrypting" />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isWorking}>
              {isWorking ? "Setting up…" : "Create account"}
            </Button>
            <FieldDescription className="text-center">
              Already have an account? <a href="/auth/signin">Sign in</a>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
