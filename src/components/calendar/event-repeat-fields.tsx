import { useState } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import {
  EventSelectField,
  EventTextField,
  SELECT_CLASS,
} from "@/components/calendar/event-select-field";
import { TWIG_REPEAT_LABELS, TWIG_REPEATS, type TwigRepeat } from "@/lib/twigs/twig-series";

type EventRepeatFieldsProps = {
  register: UseFormRegister<TwigFormValues>;
  errors: FieldErrors<TwigFormValues>;
};

/**
 * How often a new task repeats, and the last date it does. The end date only matters once
 * something repeats, so it appears then; the choice is mirrored locally just to know that,
 * and the form stays the one place the value lives.
 */
export function EventRepeatFields({ register, errors }: EventRepeatFieldsProps) {
  const [repeat, setRepeat] = useState<TwigRepeat>("none");
  const repeatField = register("repeat");

  return (
    <>
      <EventSelectField id="event-repeat" label="Repeats" error={errors.repeat}>
        <select
          id="event-repeat"
          {...repeatField}
          onChange={(event) => {
            const next = TWIG_REPEATS.find((option) => option === event.currentTarget.value);

            setRepeat(next ?? "none");
            void repeatField.onChange(event);
          }}
          className={SELECT_CLASS}
        >
          {TWIG_REPEATS.map((option) => (
            <option key={option} value={option}>
              {TWIG_REPEAT_LABELS[option]}
            </option>
          ))}
        </select>
      </EventSelectField>

      {repeat === "none" ? null : (
        <EventTextField
          id="event-repeat-until"
          label="Repeats until"
          type="date"
          placeholder="YYYY-MM-DD"
          field={register("repeatUntil")}
          error={errors.repeatUntil}
        />
      )}
    </>
  );
}
