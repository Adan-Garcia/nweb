import type { FieldErrors, UseFormHandleSubmit, UseFormRegister } from "react-hook-form";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { EventKindStatusFields } from "@/components/calendar/event-kind-status-fields";
import { EventRepeatFields } from "@/components/calendar/event-repeat-fields";
import { EventScopeField } from "@/components/calendar/event-scope-field";
import {
  EventSelectField,
  EventTextField,
  SELECT_CLASS,
} from "@/components/calendar/event-select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { focusNextFieldOnEnter } from "@/lib/utils";

type EventOverlayProps = {
  isOpen: boolean;
  editingTwigId: string | null;
  /** The task being edited is one occurrence of a series, so the edit asks how far it goes. */
  isEditingSeries?: boolean;
  register: UseFormRegister<TwigFormValues>;
  handleSubmit: UseFormHandleSubmit<TwigFormValues>;
  errors: FieldErrors<TwigFormValues>;
  branchOptions: readonly { id: string; label: string }[];
  onSubmit: (values: TwigFormValues) => void;
  onClose: () => void;
};

export function EventOverlay({
  isOpen,
  editingTwigId,
  isEditingSeries = false,
  register,
  handleSubmit,
  errors,
  branchOptions,
  onSubmit,
  onClose,
}: EventOverlayProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <Card
        className="w-full max-w-lg border-border/80 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <CardTitle>{editingTwigId === null ? "Add event" : "Edit event"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              void handleSubmit(onSubmit)(event);
            }}
            onKeyDown={(event) => focusNextFieldOnEnter(event.nativeEvent, event.currentTarget)}
          >
            <FieldGroup>
              <EventTextField
                id="event-title"
                label="Title"
                placeholder="e.g. Biology review"
                field={register("title")}
                error={errors.title}
              />

              <EventTextField
                id="event-date"
                label="Date"
                type="date"
                placeholder="YYYY-MM-DD"
                field={register("date")}
                error={errors.date}
              />

              <EventTextField
                id="event-time"
                label="Time"
                placeholder="e.g. 3:30 PM"
                field={register("time")}
                error={errors.time}
              />

              <EventSelectField id="event-branch" label="Branch" error={errors.branchId}>
                <select
                  id="event-branch"
                  {...register("branchId")}
                  aria-invalid={!!errors.branchId}
                  className={SELECT_CLASS}
                >
                  {branchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </EventSelectField>

              <EventKindStatusFields register={register} errors={errors} />
              {isEditingSeries ? (
                <EventScopeField register={register} errors={errors} />
              ) : (
                <EventRepeatFields register={register} errors={errors} />
              )}

              <Field orientation="horizontal" className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingTwigId === null ? "Create event" : "Save changes"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
