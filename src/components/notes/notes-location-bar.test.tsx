import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { NotesDirectoryEntry, NotesHierarchyLocation } from "@/components/notes/types";

import { NotesLocationBar } from "./notes-location-bar";
import { useNotesLocationPicker } from "./use-notes-location-picker";

const active: NotesHierarchyLocation = {
  wing: "Home",
  flight: "Fall",
  branch: "Math",
  nest: "Unit 1",
  feather: "Notes A",
};

const entry = (feather: string): NotesDirectoryEntry => ({
  ...active,
  feather,
  id: `id-${feather}`,
  createdMode: "linear",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
});

type HarnessProps = {
  openDocumentById: (id: string) => Promise<void>;
  createOrOpenDocumentAtLocation: (location: NotesHierarchyLocation) => Promise<void>;
  onDeleteDocument: (documentId: string) => void;
  activeEntry?: NotesDirectoryEntry | null;
};

// Wires the bar to the real picker hook, as the notes page does.
function Harness({
  openDocumentById,
  createOrOpenDocumentAtLocation,
  onDeleteDocument,
  activeEntry = entry("Notes A"),
}: HarnessProps) {
  const picker = useNotesLocationPicker({
    mode: "linear",
    directoryEntries: [entry("Notes A"), entry("Notes B")],
    activeDocumentId: "id-Notes A",
    activeLocation: active,
    createOrOpenDocumentAtLocation,
    openDocumentById,
  });

  return (
    <NotesLocationBar
      picker={picker}
      autoSaveLabel="Autosave enabled"
      activeEntry={activeEntry}
      isStorageReady
      isHydratingDocument={false}
      onDeleteDocument={onDeleteDocument}
    />
  );
}

function setup(overrides: Partial<HarnessProps> = {}) {
  const openDocumentById = vi.fn(() => Promise.resolve());
  const createOrOpenDocumentAtLocation = vi.fn(() => Promise.resolve());
  const onDeleteDocument = vi.fn();
  render(
    <Harness
      openDocumentById={openDocumentById}
      createOrOpenDocumentAtLocation={createOrOpenDocumentAtLocation}
      onDeleteDocument={onDeleteDocument}
      {...overrides}
    />,
  );
  return { openDocumentById, createOrOpenDocumentAtLocation, onDeleteDocument };
}

describe("NotesLocationBar", () => {
  it("shows the current value of each level and the autosave status", () => {
    setup();
    for (const value of ["Home", "Fall", "Math", "Unit 1", "Notes A"]) {
      expect(screen.getByRole("button", { name: value })).toBeInTheDocument();
    }
    expect(screen.getByText("Autosave enabled")).toBeInTheDocument();
  });

  it("opens another note chosen from the Note menu", async () => {
    const user = userEvent.setup();
    const { openDocumentById } = setup();

    await user.click(screen.getByRole("button", { name: "Notes A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Notes B" }));

    expect(openDocumentById).toHaveBeenCalledWith("id-Notes B");
  });

  it("deletes the open note only after the path is confirmed", async () => {
    const user = userEvent.setup();
    const { onDeleteDocument } = setup();

    await user.click(screen.getByRole("button", { name: "Delete Note" }));

    // The path is spelled out, because the trigger only ever says "Delete Note".
    expect(await screen.findByText("Home / Fall / Math / Unit 1 / Notes A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep Note" }));
    expect(onDeleteDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Note" }));
    const confirmation = await screen.findByRole("dialog");
    await user.click(within(confirmation).getByRole("button", { name: "Delete Note" }));

    expect(onDeleteDocument).toHaveBeenCalledWith("id-Notes A");
  });

  it("cannot delete anything while no note is open", () => {
    setup({ activeEntry: null });
    expect(screen.getByRole("button", { name: "Delete Note" })).toBeDisabled();
  });

  it("walks through adding a new note: name it, pick a type, create it", async () => {
    const user = userEvent.setup();
    const { createOrOpenDocumentAtLocation } = setup();

    await user.click(screen.getByRole("button", { name: "Notes A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Note..." }));

    const input = await screen.findByPlaceholderText("Enter note");
    await user.clear(input);
    await user.type(input, "Brand new");
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(await screen.findByText("Home / Fall / Math / Unit 1 / Brand new")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Spatial Note" }));
    await user.click(screen.getByRole("button", { name: "Create and Open Note" }));

    expect(createOrOpenDocumentAtLocation).toHaveBeenCalledWith(
      { ...active, feather: "Brand new" },
      "spatial",
    );
  });
});
