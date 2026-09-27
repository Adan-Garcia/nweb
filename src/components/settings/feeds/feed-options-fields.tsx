import { useWatch } from "react-hook-form";

import { type BranchOption, REFRESH_OPTIONS } from "@/components/settings/feeds/feed-form";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TWIG_KIND_LABELS, TWIG_KINDS } from "@/lib/twigs/twig-model";

export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm";

type FeedOptionsFieldsProps = {
  form: ReturnType<typeof useFeedEditor>["form"];
  branchOptions: BranchOption[];
};

/** Where events go when no rule says, how often to look again, and how far back to go. */
export function FeedOptionsFields({ form, branchOptions }: FeedOptionsFieldsProps) {
  const source = useWatch({ control: form.control, name: "source" });
  const { errors } = form.formState;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="feed-branch">Course</FieldLabel>
        <select {...form.register("branchId")} id="feed-branch" className={SELECT_CLASS}>
          <option value="">The workspace&apos;s first course</option>
          {branchOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.label}
            </option>
          ))}
        </select>
        <FieldDescription>Where an event goes when no rule names a course.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="feed-kind">Kind</FieldLabel>
        <select {...form.register("kind")} id="feed-kind" className={SELECT_CLASS}>
          {TWIG_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {TWIG_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <FieldDescription>Unless a rule sets another.</FieldDescription>
      </Field>

      {source === "url" ? (
        <Field>
          <FieldLabel htmlFor="feed-refresh">Check for changes</FieldLabel>
          <select {...form.register("refreshMinutes")} id="feed-refresh" className={SELECT_CLASS}>
            {REFRESH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field data-invalid={!!errors.pastDays}>
        <FieldLabel htmlFor="feed-past-days">Skip events older than (days)</FieldLabel>
        <Input
          {...form.register("pastDays")}
          id="feed-past-days"
          inputMode="numeric"
          placeholder="Everything"
          aria-invalid={!!errors.pastDays}
        />
        <FieldDescription>Leave empty to bring in the whole history.</FieldDescription>
        <FieldError errors={[errors.pastDays]} />
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" {...form.register("completePast")} />
        Mark events that are already over as done
      </label>
    </div>
  );
}
