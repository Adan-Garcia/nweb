import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { NotesDirectoryEntry } from "@/components/notes/types";
import {
  BRANCH_ID,
  makeBranch,
  makeEntry,
  makeFlight,
  makeNest,
  makeSnapshot,
  makeWing,
  NEST_ID,
} from "@/test/workspace-fixtures";

import { selectionForEntry } from "./location-hierarchy";
import { NotesFileViewer } from "./notes-file-viewer";

/** Two wings, so one group on screen is on the active path and one is not. */
const snapshot = makeSnapshot({
  wings: [makeWing({ name: "Home" }), makeWing({ id: "wing-2", name: "Work" })],
  flights: [
    makeFlight({ name: "Fall 2026" }),
    makeFlight({ id: "flight-2", wingId: "wing-2", name: "Q1 2026", term: null, year: null }),
  ],
  branches: [
    makeBranch({ name: "Math" }),
    makeBranch({ id: "branch-2", flightId: "flight-2", name: "Ops" }),
  ],
  nests: [
    makeNest({ name: "Unit 1" }),
    makeNest({ id: "nest-2", branchId: "branch-2", name: "Runbooks" }),
  ],
});

const entries: NotesDirectoryEntry[] = [
  makeEntry({ id: "id-Notes A", feather: "Notes A", updatedAt: 5 }),
  makeEntry({ id: "id-Notes B", feather: "Notes B", updatedAt: 4, createdMode: "spatial" }),
  makeEntry({
    id: "id-Oncall",
    feather: "Oncall",
    branchId: "branch-2",
    nestIds: ["nest-2"],
    updatedAt: 3,
  }),
];

function setup(overrides: Partial<Parameters<typeof NotesFileViewer>[0]> = {}) {
  const props = {
    snapshot,
    entries,
    activeDocumentId: "id-Notes A",
    activeCreatedMode: "linear" as const,
    activeSelection: selectionForEntry(snapshot, entries[0]),
    isStorageReady: true,
    isBusy: false,
    onOpenDocument: vi.fn(),
    onRenameDocument: vi.fn(),
    onDeleteDocument: vi.fn(),
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

  it("reads the path off the entities, so a rename shows up here", () => {
    setup({
      snapshot: {
        ...snapshot,
        branches: [makeBranch({ name: "Mathematics" }), ...snapshot.branches.slice(1)],
      },
    });

    expect(
      screen.getByText(/Current path: Home \/ Fall 2026 \/ Mathematics \/ Unit 1 \/ Notes A/),
    ).toBeInTheDocument();
  });

  it("opens the groups on the active path so the active note is visible, others stay closed", () => {
    setup();

    expect(screen.getByRole("button", { name: `Open Notes A` })).toBeVisible();
    expect(screen.queryByRole("button", { name: `Open Oncall` })).not.toBeInTheDocument();
  });

  it("opens a note when it is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenDocument } = setup();

    await user.click(screen.getByRole("button", { name: `Open Notes B` }));

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

    expect(await screen.findByRole("button", { name: `Open Oncall` })).toBeVisible();
  });

  it("saves the active note on request", async () => {
    const user = userEvent.setup();
    const { onSaveNow } = setup();

    await user.click(screen.getByRole("button", { name: "Save Active Note" }));

    expect(onSaveNow).toHaveBeenCalledOnce();
  });

  it("disables the actions while storage is loading or busy", () => {
    const { rerender, ...rest } = setup({ isStorageReady: false });
    expect(screen.getByRole("button", { name: "Save Active Note" })).toBeDisabled();

    rerender(<NotesFileViewer {...rest} isStorageReady isBusy />);
    expect(screen.getByRole("button", { name: "Save Active Note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Open Notes B` })).toBeDisabled();
  });

  it("lists a note tagged with two nests under each of them", async () => {
    const user = userEvent.setup();
    const tagged = makeEntry({ id: "id-Both", feather: "Shared", nestIds: [NEST_ID, "nest-3"] });
    setup({
      snapshot: {
        ...snapshot,
        nests: [...snapshot.nests, makeNest({ id: "nest-3", branchId: BRANCH_ID, name: "Unit 2" })],
      },
      entries: [tagged],
      activeDocumentId: "id-Both",
      activeSelection: selectionForEntry(snapshot, tagged),
    });

    const list = screen.getByRole("list", { name: "Saved notes" });

    // The nest the note was reached through is open; the other is a group of its own.
    expect(within(list).getAllByRole("button", { name: "Open Shared" })).toHaveLength(1);

    await user.click(within(list).getByRole("button", { name: /Unit 2/ }));

    expect(within(list).getAllByRole("button", { name: "Open Shared" })).toHaveLength(2);
  });

  it("renames a note in place, which nothing else could do before", async () => {
    const user = userEvent.setup();
    const { onRenameDocument } = setup();

    await user.click(screen.getByRole("button", { name: "Rename Notes A" }));
    const field = screen.getByLabelText("New name for Notes A");
    await user.clear(field);
    await user.type(field, "Notes A, revised");
    await user.click(screen.getByRole("button", { name: "Save the new name" }));

    expect(onRenameDocument).toHaveBeenCalledWith("id-Notes A", "Notes A, revised");
  });

  it("backs out of a rename without writing anything", async () => {
    const user = userEvent.setup();
    const { onRenameDocument } = setup();

    await user.click(screen.getByRole("button", { name: "Rename Notes A" }));
    await user.click(screen.getByRole("button", { name: "Keep the old name" }));

    expect(screen.queryByLabelText("New name for Notes A")).not.toBeInTheDocument();
    expect(onRenameDocument).not.toHaveBeenCalled();
  });

  it("asks before deleting a note, because nothing here can undo it", async () => {
    const user = userEvent.setup();
    const { onDeleteDocument } = setup();

    await user.click(screen.getByRole("button", { name: "Delete Notes A" }));
    expect(onDeleteDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep Notes A" }));
    await user.click(screen.getByRole("button", { name: "Delete Notes A" }));
    await user.click(screen.getByRole("button", { name: "Delete Notes A for good" }));

    expect(onDeleteDocument).toHaveBeenCalledWith("id-Notes A");
  });

  it("remembers which groups were open for the next visit", async () => {
    const user = userEvent.setup();
    const { unmount } = setup();

    // The Work wing is not on the active note's path, so nothing reopens it for us.
    await user.click(screen.getByRole("button", { name: /Work/ }));
    await user.click(screen.getByRole("button", { name: /Q1 2026/ }));
    await user.click(screen.getByRole("button", { name: /Ops/ }));
    await user.click(screen.getByRole("button", { name: /Runbooks/ }));
    expect(screen.getByRole("button", { name: "Open Oncall" })).toBeVisible();

    unmount();
    setup();

    expect(screen.getByRole("button", { name: "Open Oncall" })).toBeVisible();
  });

  it("still opens whatever the active note needs open, whatever was remembered", async () => {
    const user = userEvent.setup();
    const { unmount } = setup();

    await user.click(screen.getByRole("button", { name: /Math/ }));
    expect(screen.queryByRole("button", { name: "Open Notes A" })).not.toBeInTheDocument();

    unmount();
    setup();

    // A note you cannot see is worse than a shape you did not ask for.
    expect(screen.getByRole("button", { name: "Open Notes A" })).toBeVisible();
  });

  it("explains when nothing has been saved yet", () => {
    setup({ entries: [], activeDocumentId: null });

    expect(screen.getByText("No notes saved yet for this workspace.")).toBeInTheDocument();
  });
});
