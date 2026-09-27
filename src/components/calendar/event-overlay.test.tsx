import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { twigFormSchema, type TwigFormValues } from "./calendar-shared";
import { EventOverlay } from "./event-overlay";

// Drives the overlay with a real react-hook-form instance, as the calendar page does.
function Harness({
  isOpen = true,
  editingTwigId = null,
  isEditingSeries = false,
  onSubmit,
  onClose,
  defaults = {},
}: {
  isOpen?: boolean;
  editingTwigId?: string | null;
  isEditingSeries?: boolean;
  onSubmit: (values: TwigFormValues) => void;
  onClose: () => void;
  defaults?: Partial<TwigFormValues>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TwigFormValues>({
    resolver: zodResolver(twigFormSchema),
    defaultValues: {
      title: "",
      date: "2026-04-16",
      time: "9:00 AM",
      branchId: "branch-1",
      kind: "homework",
      status: "incomplete",
      repeat: "none",
      repeatUntil: "",
      scope: "one",
      ...defaults,
    },
  });

  return (
    <EventOverlay
      isOpen={isOpen}
      editingTwigId={editingTwigId}
      isEditingSeries={isEditingSeries}
      register={register}
      handleSubmit={handleSubmit}
      errors={errors}
      branchOptions={[
        { id: "branch-1", label: "Fall 2026 / Biology 101" },
        { id: "branch-2", label: "Fall 2026 / History" },
      ]}
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

    setup({ editingTwigId: "twig-3" });
    expect(screen.getByText("Edit event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("offers the workspace's branches, every task type and every status", () => {
    setup();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Fall 2026 / Biology 101",
      "Fall 2026 / History",
      "Homework",
      "Exam",
      "Essay",
      "Project",
      "Reading",
      "Other",
      "Incomplete",
      "In Progress",
      "Complete",
      "Does not repeat",
      "Every day",
      "Every weekday",
      "Every week",
      "Every 2 weeks",
      "Every month",
    ]);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-04-16");
    expect(screen.getByLabelText("Time")).toHaveValue("9:00 AM");
  });

  it("submits the entered values", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.type(screen.getByLabelText("Title"), "Study group");
    await user.selectOptions(screen.getByLabelText("Branch"), "branch-2");
    await user.selectOptions(screen.getByLabelText("Type"), "exam");
    await user.selectOptions(screen.getByLabelText("Status"), "inprogress");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "Study group",
      date: "2026-04-16",
      time: "9:00 AM",
      branchId: "branch-2",
      kind: "exam",
      status: "inprogress",
      repeat: "none",
      repeatUntil: "",
      scope: "one",
    });
  });

  it("asks when a repeating task ends, and submits that", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    expect(screen.queryByLabelText("Repeats until")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Problem set");
    await user.selectOptions(screen.getByLabelText("Repeats"), "weekly");
    await user.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByText("Pick the last date, after the first one")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Repeats until"), "2026-05-14");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      repeat: "weekly",
      repeatUntil: "2026-05-14",
    });

    await user.selectOptions(screen.getByLabelText("Repeats"), "none");
    expect(screen.queryByLabelText("Repeats until")).not.toBeInTheDocument();
  });

  it("offers to make a task being edited repeat, when it does not yet", () => {
    setup({ editingTwigId: "twig-1" });

    expect(screen.getByLabelText("Repeats")).toBeInTheDocument();
    expect(screen.queryByLabelText("Apply changes to")).not.toBeInTheDocument();
  });

  it("asks how far an edit to a repeating task reaches, and submits that", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup({
      editingTwigId: "twig-1",
      isEditingSeries: true,
      defaults: { title: "Weekly quiz" },
    });

    // An occurrence is already in a series, so it is not offered a second one.
    expect(screen.queryByLabelText("Repeats")).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Apply changes to"),
      "This and following events",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: "Weekly quiz", scope: "following" });
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
