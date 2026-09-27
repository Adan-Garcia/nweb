import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** The native `<select>` look the event form uses, beside the shadcn inputs. */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm";

type EventSelectFieldProps = {
  id: string;
  label: string;
  error: { message?: string } | undefined;
  children: ReactNode;
};

/**
 * One labelled `<select>` in the event form. The register spread differs per field, so it
 * arrives already applied to the options in `children` rather than as a prop.
 */
export function EventSelectField({ id, label, error, children }: EventSelectFieldProps) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      <FieldError errors={[error]} />
    </Field>
  );
}

type EventTextFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
  field: UseFormRegisterReturn;
  error: { message?: string } | undefined;
};

/** One labelled text input in the event form. */
export function EventTextField({
  id,
  label,
  placeholder,
  type,
  field,
  error,
}: EventTextFieldProps) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input {...field} id={id} type={type} placeholder={placeholder} aria-invalid={!!error} />
      <FieldError errors={[error]} />
    </Field>
  );
}
