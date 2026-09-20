import type { FieldErrors, UseFormHandleSubmit, UseFormRegister } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { EventFormValues } from "@/components/calendar/calendar-shared"

type EventOverlayProps = {
  isOpen: boolean
  editingEventId: number | null
  register: UseFormRegister<EventFormValues>
  handleSubmit: UseFormHandleSubmit<EventFormValues>
  errors: FieldErrors<EventFormValues>
  eventColorOptions: readonly string[]
  onSubmit: (values: EventFormValues) => void
  onClose: () => void
}

export function EventOverlay({
  isOpen,
  editingEventId,
  register,
  handleSubmit,
  errors,
  eventColorOptions,
  onSubmit,
  onClose,
}: EventOverlayProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <Card className="w-full max-w-lg border-border/80 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>{editingEventId === null ? "Add event" : "Edit event"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={(event) => {
              void handleSubmit(onSubmit)(event)
            }}>
            <FieldGroup>
              <Field data-invalid={!!errors.title}>
                <FieldLabel htmlFor="event-title">Title</FieldLabel>
                <Input
                  {...register("title")}
                  id="event-title"
                  placeholder="e.g. Biology review"
                  aria-invalid={!!errors.title}
                />
                <FieldError errors={[errors.title]} />
              </Field>

              <Field data-invalid={!!errors.date}>
                <FieldLabel htmlFor="event-date">Date</FieldLabel>
                <Input
                  {...register("date")}
                  id="event-date"
                  type="date"
                  placeholder="YYYY-MM-DD"
                  aria-invalid={!!errors.date}
                />
                <FieldError errors={[errors.date]} />
              </Field>

              <Field data-invalid={!!errors.time}>
                <FieldLabel htmlFor="event-time">Time</FieldLabel>
                <Input
                  {...register("time")}
                  id="event-time"
                  placeholder="e.g. 3:30 PM"
                  aria-invalid={!!errors.time}
                />
                <FieldError errors={[errors.time]} />
              </Field>

              <Field data-invalid={!!errors.color}>
                <FieldLabel htmlFor="event-class">Class</FieldLabel>
                <select
                  id="event-class"
                  {...register("color")}
                  aria-invalid={!!errors.color}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {eventColorOptions.map((eventColor) => (
                    <option key={eventColor} value={eventColor}>
                      {eventColor}
                    </option>
                  ))}
                </select>
                <FieldError errors={[errors.color]} />
              </Field>

              <Field data-invalid={!!errors.status}>
                <FieldLabel htmlFor="event-status">Status</FieldLabel>
                <select
                  id="event-status"
                  {...register("status")}
                  aria-invalid={!!errors.status}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="incomplete">Incomplete</option>
                  <option value="inprogress">In Progress</option>
                  <option value="complete">Complete</option>
                </select>
                <FieldError errors={[errors.status]} />
              </Field>

              <Field orientation="horizontal" className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">{editingEventId === null ? "Create event" : "Save changes"}</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
