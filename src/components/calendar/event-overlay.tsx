import type { FieldErrors, UseFormHandleSubmit, UseFormRegister } from "react-hook-form";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { EventSelectField, EventTextField } from "@/components/calendar/event-select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { TWIG_KIND_LABELS, TWIG_KINDS } from "@/lib/twig-model";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm";

type EventOverlayProps = {
  isOpen: boolean;
  editingTwigId: string | null;
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
