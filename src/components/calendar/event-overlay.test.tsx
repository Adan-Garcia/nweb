import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";

import { EVENT_COLOR_OPTIONS } from "@/lib/calendar-event";
import { eventFormSchema, type EventFormValues } from "./calendar-shared";
import { EventOverlay } from "./event-overlay";

// Drives the overlay with a real react-hook-form instance, as the calendar page does.
function Harness({
  isOpen = true,
  editingEventId = null,
  onSubmit,
  onClose,
  defaults = {},
}: {
  isOpen?: boolean;
  editingEventId?: number | null;
  onSubmit: (values: EventFormValues) => void;
  onClose: () => void;
  defaults?: Partial<EventFormValues>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      date: "2026-04-16",
      time: "9:00 AM",
      color: "Math",
      status: "incomplete",
      ...defaults,
    },
  });

  return (
    <EventOverlay
      isOpen={isOpen}
      editingEventId={editingEventId}
      register={register}
      handleSubmit={handleSubmit}
      errors={errors}
      eventColorOptions={EVENT_COLOR_OPTIONS}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}

function setup(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(<Harness onSubmit={onSubmit} onClose={onClose} {...props} />);
  return { onSubmit, onClose };
}

describe("EventOverlay", () => {
  it("renders nothing while closed", () => {
    setup({ isOpen: false });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("is titled and labelled for adding, then for editing", () => {
    const { unmount } = render(<Harness onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Add event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    unmount();

    setup({ editingEventId: 3 });
    expect(screen.getByText("Edit event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("offers every class and status, with the defaults selected", () => {
    setup();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      ...EVENT_COLOR_OPTIONS,
      "Incomplete",
      "In Progress",
      "Complete",
    ]);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-04-16");
    expect(screen.getByLabelText("Time")).toHaveValue("9:00 AM");
  });

  it("submits the entered values", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.type(screen.getByLabelText("Title"), "Study group");
    await user.selectOptions(screen.getByLabelText("Class"), "Physics");
    await user.selectOptions(screen.getByLabelText("Status"), "inprogress");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "Study group",
      date: "2026-04-16",
      time: "9:00 AM",
      color: "Physics",
      status: "inprogress",
    });
  });

  it("explains what is wrong and does not submit an invalid form", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup({ defaults: { time: "" } });

    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Time is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInvalid();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes from the Cancel button", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the backdrop is clicked, but not when the card is", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByLabelText("Title"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
