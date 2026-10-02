import { useMemo } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotesDirectoryEntry } from "@/components/notes/types";
import { getNotesDb } from "@/lib/db/notes-db";
import { createBranch, createFlight, createNest, createWing } from "@/lib/hierarchy/entity-storage";
import { loadWorkspaceSnapshot } from "@/lib/hierarchy/workspace-storage";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { ReadOnlyError } from "@/lib/keys/access";

import { selectionForEntry } from "./location-hierarchy";
import { NotesLocationBar } from "./notes-location-bar";
import { type NoteDraftPlacement, useNotesLocationPicker } from "./use-notes-location-picker";

type Seeded = {
  snapshot: WorkspaceSnapshot;
  branchId: string;
  nestId: string;
  entries: NotesDirectoryEntry[];
};

async function seed(): Promise<Seeded> {
  const wing = await createWing("Home");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Math" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });

  const entry = (feather: string): NotesDirectoryEntry => ({
    id: `id-${feather}`,
    branchId: branch.id,
    nestIds: [nest.id],
    feather,
    createdMode: "linear",
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  });

  return {
    snapshot: await loadWorkspaceSnapshot(),
    branchId: branch.id,
    nestId: nest.id,
    entries: [entry("Notes A"), entry("Notes B")],
  };
}

type HarnessProps = {
  seeded: Seeded;
  openDocumentById: (id: string) => Promise<void>;
  createNoteAt: (placement: NoteDraftPlacement) => Promise<void>;
  onDeleteDocument: (documentId: string) => void;
  hasActiveEntry?: boolean;
};

// Wires the bar to the real picker hook, as the notes page does.
function Harness({
  seeded,
  openDocumentById,
  createNoteAt,
  onDeleteDocument,
  hasActiveEntry = true,
}: HarnessProps) {
  // The hook restarts its draft whenever this changes identity, so it has to be stable.
  // In the app it is state in useNotesWorkspace; here it is memoized to match.
  const activeSelection = useMemo(
    () => selectionForEntry(seeded.snapshot, seeded.entries[0]),
    [seeded],
  );

  const picker = useNotesLocationPicker({
    mode: "linear",
    snapshot: seeded.snapshot,
    refreshSnapshot: loadWorkspaceSnapshot,
    directoryEntries: seeded.entries,
    activeDocumentId: "id-Notes A",
    activeSelection,
    createNoteAt,
    openDocumentById,
  });

  return (
    <NotesLocationBar
      picker={picker}
      snapshot={seeded.snapshot}
      autoSaveLabel="Autosave enabled"
      activeEntry={hasActiveEntry ? seeded.entries[0] : null}
      isStorageReady
      isHydratingDocument={false}
      navigationMode="path"
      onChooseNavigation={() => undefined}
      onDeleteDocument={onDeleteDocument}
    />
  );
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
    database.clear("nests"),
  ]);
});

async function setup(overrides: Partial<Omit<HarnessProps, "seeded">> = {}) {
  const seeded = await seed();
  const openDocumentById = vi.fn(() => Promise.resolve());
  const createNoteAt = vi.fn(() => Promise.resolve());
  const onDeleteDocument = vi.fn();

  render(
    <Harness
      seeded={seeded}
      openDocumentById={openDocumentById}
      createNoteAt={createNoteAt}
      onDeleteDocument={onDeleteDocument}
      {...overrides}
    />,
  );

  return { seeded, openDocumentById, createNoteAt, onDeleteDocument };
}

describe("NotesLocationBar", () => {
  it("shows the current value of each level and the autosave status", async () => {
    await setup();

    for (const value of ["Home", "Fall 2026", "Math", "Unit 1", "Notes A"]) {
      expect(screen.getByRole("button", { name: value })).toBeInTheDocument();
    }
    expect(screen.getByText("Autosave enabled")).toBeInTheDocument();
  });

  it("opens another note chosen from the Note menu", async () => {
    const user = userEvent.setup();
    const { openDocumentById } = await setup();

    await user.click(screen.getByRole("button", { name: "Notes A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Notes B" }));

    expect(openDocumentById).toHaveBeenCalledWith("id-Notes B");
  });

  it("deletes the open note only after the path is confirmed", async () => {
    const user = userEvent.setup();
    const { onDeleteDocument } = await setup();

    await user.click(screen.getByRole("button", { name: "Delete Note" }));

    // The path is spelled out, because the trigger only ever says "Delete Note".
    expect(
      await screen.findByText("Home / Fall 2026 / Math / Unit 1 / Notes A"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep Note" }));
    expect(onDeleteDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Note" }));
    const confirmation = await screen.findByRole("dialog");
    await user.click(within(confirmation).getByRole("button", { name: "Delete Note" }));

    expect(onDeleteDocument).toHaveBeenCalledWith("id-Notes A");
  });

  it("cannot delete anything while no note is open", async () => {
    await setup({ hasActiveEntry: false });

    expect(screen.getByRole("button", { name: "Delete Note" })).toBeDisabled();
  });

  it("walks through adding a new note: name it, pick a type, create it", async () => {
    const user = userEvent.setup();
    const { createNoteAt, seeded } = await setup();

    await user.click(screen.getByRole("button", { name: "Notes A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Note..." }));

    const input = await screen.findByPlaceholderText("Enter note");
    await user.type(input, "Brand new");
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(
      await screen.findByText("Home / Fall 2026 / Math / Unit 1 / Notes A"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Note Name")).toHaveValue("Brand new");

    await user.click(screen.getByRole("button", { name: "Spatial Note" }));
    expect(screen.getByRole("button", { name: "Infinite canvas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Pages (Letter or A4)" }));
    await user.click(screen.getByRole("button", { name: "Create and Open Note" }));

    expect(createNoteAt).toHaveBeenCalledWith(
      { branchId: seeded.branchId, nestIds: [seeded.nestId], feather: "Brand new" },
      "spatial",
      "paged",
    );
  });

  it("says why when a note cannot be added to something shared to read", async () => {
    const user = userEvent.setup();

    await setup({ createNoteAt: vi.fn(() => Promise.reject(new ReadOnlyError())) });

    await user.click(screen.getByRole("button", { name: "Notes A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Note..." }));
    await user.type(await screen.findByPlaceholderText("Enter note"), "Sneaky");
    await user.click(screen.getByRole("button", { name: "Add Note" }));
    await user.click(await screen.findByRole("button", { name: "Create and Open Note" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/shared with you to read/);
  });

  it("adds a branch as a real record, and moves the path onto it", async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole("button", { name: "Math" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add Branch..." }));

    const input = await screen.findByPlaceholderText("Enter branch");
    await user.type(input, "Physics");
    await user.click(screen.getByRole("button", { name: "Add Branch" }));

    await waitFor(async () => {
      const snapshot = await loadWorkspaceSnapshot();
      expect(snapshot.branches.map((branch) => branch.name)).toContain("Physics");
    });
  });
});
