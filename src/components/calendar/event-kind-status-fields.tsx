import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { EventSelectField, SELECT_CLASS } from "@/components/calendar/event-select-field";
import { TWIG_KIND_LABELS, TWIG_KINDS } from "@/lib/twigs/twig-model";

type EventKindStatusFieldsProps = {
  register: UseFormRegister<TwigFormValues>;
  errors: FieldErrors<TwigFormValues>;
};

/** What kind of task it is, and how far along. */
export function EventKindStatusFields({ register, errors }: EventKindStatusFieldsProps) {
  return (
    <>
      <EventSelectField id="event-kind" label="Type" error={errors.kind}>
        <select
          id="event-kind"
          {...register("kind")}
          aria-invalid={!!errors.kind}
          className={SELECT_CLASS}
        >
          {TWIG_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {TWIG_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </EventSelectField>

      <EventSelectField id="event-status" label="Status" error={errors.status}>
        <select
          id="event-status"
          {...register("status")}
          aria-invalid={!!errors.status}
          className={SELECT_CLASS}
        >
          <option value="incomplete">Incomplete</option>
          <option value="inprogress">In Progress</option>
          <option value="complete">Complete</option>
        </select>
      </EventSelectField>
    </>
  );
}
