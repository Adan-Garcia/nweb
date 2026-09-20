import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { NotesDirectoryEntry, NotesHierarchyLocation } from "@/components/notes/types";
import { NotesFileViewer } from "./notes-file-viewer";

function entry(
  location: NotesHierarchyLocation,
  updatedAt = 1,
  createdMode: "linear" | "spatial" = "linear",
): NotesDirectoryEntry {
  return { ...location, id: `id-${location.feather}`, createdMode, createdAt: 0, updatedAt };
}

const active: NotesHierarchyLocation = {
  wing: "Home",
  flight: "Fall 2026",
  branch: "Math",
  nest: "Unit 1",
  feather: "Notes A",
};

const entries = [
  entry(active, 5),
  entry({ ...active, feather: "Notes B" }, 4, "spatial"),
  entry({ wing: "Work", flight: "Q1", branch: "Ops", nest: "Runbooks", feather: "Oncall" }, 3),
];

function setup(overrides: Partial<Parameters<typeof NotesFileViewer>[0]> = {}) {
  const props = {
    entries,
    activeDocumentId: "id-Notes A",
    activeCreatedMode: "linear" as const,
    activeLocation: active,
    isStorageReady: true,
    isBusy: false,
    onOpenDocument: vi.fn(),
    onCreateOrOpenLocation: vi.fn(),
    onSaveNow: vi.fn(),
    ...overrides,
  };
  const view = render(<NotesFileViewer {...props} />);
  return { ...props, ...view };
}

describe("NotesFileViewer", () => {
  it("shows the current path and the note mode", () => {
    setup();
    expect(
      screen.getByText(/Current path: Home \/ Fall 2026 \/ Math \/ Unit 1 \/ Notes A/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Created for: linear/)).toBeInTheDocument();
  });

  it("pre-fills the path form from the active location", () => {
    setup();
    expect(screen.getByLabelText("Wing")).toHaveValue("Home");
    expect(screen.getByLabelText("Flight")).toHaveValue("Fall 2026");
    expect(screen.getByLabelText("Branch")).toHaveValue("Math");
    expect(screen.getByLabelText("Nest")).toHaveValue("Unit 1");
    expect(screen.getByLabelText("Feather (Note Name)")).toHaveValue("Notes A");
  });

  it("opens the groups on the active path so the active note is visible, others stay closed", () => {
    setup();
    expect(screen.getByRole("button", { name: /Notes A/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Oncall/ })).not.toBeInTheDocument();
  });

  it("opens a note when it is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenDocument } = setup();

    await user.click(screen.getByRole("button", { name: /Notes B/ }));

    expect(onOpenDocument).toHaveBeenCalledWith("id-Notes B");
  });

  it("expands a collapsed group to reveal its notes", async () => {
    const user = userEvent.setup();
    setup();
    const list = screen.getByRole("list", { name: "Saved notes" });

    await user.click(within(list).getByRole("button", { name: /Work/ }));
    await user.click(within(list).getByRole("button", { name: /^Q1/ }));
    await user.click(within(list).getByRole("button", { name: /Ops/ }));
    await user.click(within(list).getByRole("button", { name: /Runbooks/ }));

    expect(await screen.findByRole("button", { name: /Oncall/ })).toBeVisible();
  });

  it("opens or creates whatever path is typed into the form", async () => {
    const user = userEvent.setup();
    const { onCreateOrOpenLocation } = setup();

    const feather = screen.getByLabelText("Feather (Note Name)");
    await user.clear(feather);
    await user.type(feather, "Exam review");
    await user.click(screen.getByRole("button", { name: "Open or Create Path" }));

    expect(onCreateOrOpenLocation).toHaveBeenCalledWith({ ...active, feather: "Exam review" });
  });

  it("saves the active note on request", async () => {
    const user = userEvent.setup();
    const { onSaveNow } = setup();

    await user.click(screen.getByRole("button", { name: "Save Active Note" }));

    expect(onSaveNow).toHaveBeenCalledOnce();
  });

  it("disables the actions while storage is loading or busy", () => {
    const { rerender, ...rest } = setup({ isStorageReady: false });
    expect(screen.getByRole("button", { name: "Open or Create Path" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Active Note" })).toBeDisabled();

    rerender(<NotesFileViewer {...rest} isStorageReady isBusy />);
    expect(screen.getByRole("button", { name: "Open or Create Path" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Notes B/ })).toBeDisabled();
  });

  it("restarts the draft from the new location when the active note changes", async () => {
    const user = userEvent.setup();
    const { rerender, ...rest } = setup();

    await user.type(screen.getByLabelText("Wing"), " draft");
    expect(screen.getByLabelText("Wing")).toHaveValue("Home draft");

    rerender(<NotesFileViewer {...rest} activeLocation={{ ...active, wing: "Work" }} />);

    expect(screen.getByLabelText("Wing")).toHaveValue("Work");
  });

  it("explains when nothing has been saved yet", () => {
    setup({ entries: [], activeDocumentId: null });
    expect(screen.getByText("No notes saved yet for this workspace.")).toBeInTheDocument();
  });
});
