import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ArrivalChoice } from "@/components/auth/arrival-choice";
import { serverSigninSchema, type ServerSigninValues } from "@/components/auth/signin-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ArrivalMode } from "@/lib/account/server-connect";

type ServerSigninFormProps = {
  defaultServerUrl: string;
  /** Whether this device already has notes, which is when it asks what to keep. */
  hasContent: boolean;
  isWorking: boolean;
  error: string | null;
  onSubmit: (values: ServerSigninValues, mode: ArrivalMode) => void;
  className?: string;
};

/** A new device joining a server account it already has elsewhere. */
export function ServerSigninForm({
  defaultServerUrl,
  hasContent,
  isWorking,
  error,
  onSubmit,
  className,
}: ServerSigninFormProps) {
  const [mode, setMode] = useState<ArrivalMode>("merge");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ServerSigninValues>({
    resolver: zodResolver(serverSigninSchema),
    defaultValues: { name: "", email: "", passphrase: "", serverUrl: defaultServerUrl },
  });
  const field = (id: keyof ServerSigninValues, label: string, type: string, auto: string) => (
    <Field data-invalid={!!errors[id]}>
      <FieldLabel htmlFor={`signin-${id}`}>{label}</FieldLabel>
      <Input {...register(id)} id={`signin-${id}`} type={type} autoComplete={auto} />
      <FieldError errors={[errors[id]]} />
    </Field>
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-title">Sign in to your sync account</CardTitle>
        <CardDescription>
          Bring the notes you keep on a sync server to this device. New here? Create an account
          instead — a server is optional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* The values are never logged: they hold the passphrase. */}
        <form
          noValidate
          onSubmit={(event) => void handleSubmit((values) => onSubmit(values, mode))(event)}
        >
          <FieldGroup>
            {field("serverUrl", "Server address", "url", "url")}
            {field("email", "Email", "email", "email")}
            {field("passphrase", "Passphrase", "password", "current-password")}
            {field("name", "Your name on this device", "text", "name")}
            {hasContent ? <ArrivalChoice value={mode} onChange={setMode} /> : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isWorking}>
              {isWorking ? "Signing in…" : "Sign in"}
            </Button>
            <FieldDescription className="text-center">
              No account yet? <a href="/auth/signup">Create one</a>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
