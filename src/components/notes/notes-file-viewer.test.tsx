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
    expect(screen.getByRole("button", { name: /Notes B/ })).toBeDisabled();
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
    expect(within(list).getAllByRole("button", { name: /Shared/ })).toHaveLength(1);

    await user.click(within(list).getByRole("button", { name: /Unit 2/ }));

    expect(within(list).getAllByRole("button", { name: /Shared/ })).toHaveLength(2);
  });

  it("explains when nothing has been saved yet", () => {
    setup({ entries: [], activeDocumentId: null });

    expect(screen.getByText("No notes saved yet for this workspace.")).toBeInTheDocument();
  });
});
