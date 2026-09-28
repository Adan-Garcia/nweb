import { Plus, X } from "lucide-react";

import { useOnboardingCourses } from "@/components/onboarding/use-onboarding-courses";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusNextFieldOnEnter } from "@/lib/utils";

export const COURSES_FORM_ID = "onboarding-courses";

type CoursesStepProps = {
  /** Runs once what was typed is saved, which is what the step's Continue waits for. */
  onSaved: () => void;
};

/**
 * The term this is, and the courses in it. Submitted by the step's own Continue button,
 * through the form id, so the step reads as one screen with one way forward.
 */
export function CoursesStep({ onSaved }: CoursesStepProps) {
  const { form, rows, isLoading, addRow, removeRow, save } = useOnboardingCourses();
  const {
    register,
    formState: { errors },
  } = form;

  if (isLoading) {
    return <p className="text-body text-muted-foreground">Loading your workspace…</p>;
  }

  return (
    <form
      id={COURSES_FORM_ID}
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await save(values);
          onSaved();
        })(event);
      }}
      onKeyDown={(event) => focusNextFieldOnEnter(event.nativeEvent, event.currentTarget)}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.term}>
          <FieldLabel htmlFor="onboarding-term">This term</FieldLabel>
          <Input id="onboarding-term" {...register("term")} placeholder="e.g. Fall 2026" />
          <FieldError errors={[errors.term]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="onboarding-course-0">Courses</FieldLabel>
          <FieldDescription>
            One per line. Colours are picked for you; change them later in Settings → Workspace.
          </FieldDescription>
          <ul className="grid gap-2">
            {rows.map((row, index) => (
              <li key={row.id} className="flex items-center gap-2">
                <Input
                  id={`onboarding-course-${index}`}
                  aria-label={`Course ${index + 1}`}
                  placeholder="e.g. MECE 110 Thermodynamics"
                  {...register(`courses.${index}.name`)}
                />
                {row.branchId === null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove course ${index + 1}`}
                    onClick={() => removeRow(index)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              Add another course
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </form>
  );
}
