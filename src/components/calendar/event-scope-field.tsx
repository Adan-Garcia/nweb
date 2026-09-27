import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { EventSelectField, SELECT_CLASS } from "@/components/calendar/event-select-field";
import { SERIES_SCOPE_LABELS, SERIES_SCOPES } from "@/lib/twigs/twig-series";

type EventScopeFieldProps = {
  register: UseFormRegister<TwigFormValues>;
  errors: FieldErrors<TwigFormValues>;
};

/**
 * Which occurrences an edit to a repeating task reaches. Asked in the form rather than after
 * it, so the choice is in view while the change is being made.
 */
export function EventScopeField({ register, errors }: EventScopeFieldProps) {
  return (
    <EventSelectField id="event-scope" label="Apply changes to" error={errors.scope}>
      <select id="event-scope" {...register("scope")} className={SELECT_CLASS}>
        {SERIES_SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {SERIES_SCOPE_LABELS[scope]}
          </option>
        ))}
      </select>
    </EventSelectField>
  );
}
