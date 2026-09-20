import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotesCreateNoteDialog } from "./create-note-dialog";
import { NotesCreateSegmentDialog } from "./create-segment-dialog";
import { NotesLocationSegmentDropdown } from "./location-segment-dropdown";

describe("NotesCreateNoteDialog", () => {
  function setup(overrides: Partial<Parameters<typeof NotesCreateNoteDialog>[0]> = {}) {
    const props = {
      isOpen: true,
      onOpenChange: vi.fn(),
      selectedLocationSummary: "Home / Fall / Math / Unit 1 / Notes",
      newNoteMode: "linear" as const,
      onModeChange: vi.fn(),
      onCreate: vi.fn(),
      isCreatingNote: false,
      isStorageReady: true,
      isHydratingDocument: false,
      ...overrides,
    };
    render(<NotesCreateNoteDialog {...props} />);
    return props;
  }

  it("shows the path that will be created", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Home / Fall / Math / Unit 1 / Notes")).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    setup({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows which note type is selected and lets the user change it", async () => {
    const user = userEvent.setup();
    const { onModeChange } = setup({ newNoteMode: "spatial" });

    expect(screen.getByRole("button", { name: "Spatial Note" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Linear Note" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Linear Note" }));
    expect(onModeChange).toHaveBeenCalledWith("linear");
  });

  it("creates the note when confirmed", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();

    await user.click(screen.getByRole("button", { name: "Create and Open Note" }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it.each([
    ["storage is not ready", { isStorageReady: false }],
    ["a note is loading", { isHydratingDocument: true }],
  ])("cannot create while %s", (_reason, overrides) => {
    setup(overrides);
    expect(screen.getByRole("button", { name: "Create and Open Note" })).toBeDisabled();
  });

  it("shows progress and blocks cancelling while creating", () => {
    setup({ isCreatingNote: true });
    expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("asks to close when cancelled", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // The dialog library passes event details as a second argument.
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

describe("NotesCreateSegmentDialog", () => {
  function setup(overrides: Partial<Parameters<typeof NotesCreateSegmentDialog>[0]> = {}) {
    const props = {
      segmentModalState: { segment: "branch" as const, label: "Branch" },
      segmentDraftValue: "Biology",
      onSegmentDraftValueChange: vi.fn(),
      onCreateSegment: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
    render(<NotesCreateSegmentDialog {...props} />);
    return props;
  }

  it("is open only when a segment is being added, titled after it", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Add Branch" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter branch")).toHaveValue("Biology");
  });

  it("is closed when there is no segment", () => {
    setup({ segmentModalState: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports what is typed", async () => {
    const user = userEvent.setup();
    const { onSegmentDraftValueChange } = setup({ segmentDraftValue: "" });

    await user.type(screen.getByPlaceholderText("Enter branch"), "C");

    expect(onSegmentDraftValueChange).toHaveBeenCalledWith("C");
  });

  it("adds the value only when it is not blank", async () => {
    const user = userEvent.setup();
    const { onCreateSegment } = setup();

    await user.click(screen.getByRole("button", { name: "Add Branch" }));
    expect(onCreateSegment).toHaveBeenCalledOnce();
  });

  it("disables adding a blank value", () => {
    setup({ segmentDraftValue: "   " });
    expect(screen.getByRole("button", { name: "Add Branch" })).toBeDisabled();
  });

  it("closes when cancelled", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("NotesLocationSegmentDropdown", () => {
  function setup() {
    const props = {
      triggerLabel: "General",
      currentLabel: "Current Branch",
      addLabel: "Branch",
      options: ["General", "Math"],
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      append: "/",
      prepend: <span data-testid="icon">i</span>,
    };
    render(<NotesLocationSegmentDropdown {...props} />);
    return props;
  }

  it("shows the current value, the icon and the separator", () => {
    setup();
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("lists the options and reports the one chosen", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(screen.getByRole("button", { name: "General" }));
    expect(await screen.findByText("Current Branch")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Math" }));

    expect(onSelect).toHaveBeenCalledWith("Math");
  });

  it("offers to add a new value", async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();

    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Branch..." }));

    expect(onAdd).toHaveBeenCalledOnce();
  });
});
