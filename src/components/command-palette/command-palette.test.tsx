import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import { createNotesDirectoryEntry } from "@/lib/notes/notes-directory-storage";
import { createTwig } from "@/lib/twigs/twig-storage";
import { useCommandPaletteStore } from "@/stores/use-command-palette-store";
import { usePreferencesStore } from "@/stores/use-preferences-store";

import { CommandPalette } from "./command-palette";

function Where() {
  const location = useLocation();

  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function setup({ canLock = false, onLock = vi.fn() } = {}) {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <input aria-label="Somewhere to type" />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
      <CommandPalette canLock={canLock} onLock={onLock} />
    </MemoryRouter>,
  );

  return { onLock };
}

const where = () => screen.getByTestId("where").textContent;
const search = () => screen.findByPlaceholderText("Search or type a command…");

const STORES = ["twigs", "notes-directory", "wings", "flights", "branches", "nests"] as const;

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
});

describe("CommandPalette", () => {
  it("opens with ⌘K and with Ctrl+K", async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard("{Meta>}k{/Meta}");
    expect(await search()).toBeInTheDocument();

    useCommandPaletteStore.getState().setOpen(false);
    await waitFor(() => expect(screen.queryByPlaceholderText(/Search or type/)).toBeNull());

    await user.keyboard("{Control>}k{/Control}");
    expect(await search()).toBeInTheDocument();
  });

  it("opens with / unless something is being typed into", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByLabelText("Somewhere to type"));
    await user.keyboard("/");
    expect(screen.queryByPlaceholderText(/Search or type/)).toBeNull();
    expect(screen.getByLabelText("Somewhere to type")).toHaveValue("/");

    await user.click(document.body);
    await user.keyboard("/");
    expect(await search()).toBeInTheDocument();
  });

  it("goes to a page and closes", async () => {
    const user = userEvent.setup();
    setup();
    useCommandPaletteStore.getState().open();

    await user.type(await search(), "Board");
    await user.click(await screen.findByRole("option", { name: "Board" }));

    expect(where()).toBe("/board");
    await waitFor(() => expect(screen.queryByPlaceholderText(/Search or type/)).toBeNull());
  });

  it("finds notes and tasks by name and hands them to their page", async () => {
    const user = userEvent.setup();
    const { path } = await ensureDefaultWorkspace();
    const note = await createNotesDirectoryEntry({ branchId: path.branch.id, feather: "Mitosis" });
    const task = await createTwig({ branchId: path.branch.id, title: "Lab write-up" });
    setup();
    useCommandPaletteStore.getState().open();

    await user.type(await search(), "Mitosis");
    await user.click(await screen.findByRole("option", { name: /Mitosis/ }));
    expect(where()).toBe(`/notes?note=${note.id}`);

    useCommandPaletteStore.getState().open();
    await user.type(await search(), "Lab write");
    await user.click(await screen.findByRole("option", { name: /Lab write-up/ }));
    expect(where()).toBe(`/board?task=${task.id}`);
  });

  it("starts a new task and opens the appearance settings", async () => {
    const user = userEvent.setup();
    setup();

    useCommandPaletteStore.getState().open();
    await user.click(await screen.findByRole("option", { name: "New task" }));
    expect(where()).toBe("/board?new=task");

    useCommandPaletteStore.getState().open();
    await user.click(await screen.findByRole("option", { name: "Customize appearance" }));
    expect(where()).toBe("/settings");
  });

  it("switches theme and accent without leaving the keyboard", async () => {
    const user = userEvent.setup();
    setup();

    useCommandPaletteStore.getState().open();
    await user.type(await search(), "Theme: Paper");
    await user.keyboard("{Enter}");
    expect(usePreferencesStore.getState().preferences.theme).toBe("paper");

    useCommandPaletteStore.getState().open();
    await user.type(await search(), "Accent: Teal");
    await user.keyboard("{Enter}");
    expect(usePreferencesStore.getState().preferences.accent).toBe("teal");
  });

  it("locks the workspace only when there is a lock to close", async () => {
    const user = userEvent.setup();
    const { onLock } = setup({ canLock: true });

    useCommandPaletteStore.getState().open();
    await user.click(await screen.findByRole("option", { name: "Lock workspace" }));

    expect(onLock).toHaveBeenCalledOnce();
  });

  it("offers no lock when there is none", async () => {
    setup();
    useCommandPaletteStore.getState().open();

    await search();
    expect(screen.queryByRole("option", { name: "Lock workspace" })).toBeNull();
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    useCommandPaletteStore.getState().open();

    await user.type(await search(), "zzzzzz");

    expect(await screen.findByText("Nothing matches.")).toBeInTheDocument();
  });

  it("goes to settings", async () => {
    const user = userEvent.setup();
    setup();
    useCommandPaletteStore.getState().open();

    await user.click(await screen.findByRole("option", { name: "Settings" }));

    expect(where()).toBe("/settings");
  });

  it("lists a note whose course it cannot name without a hint", async () => {
    const user = userEvent.setup();
    await createNotesDirectoryEntry({ branchId: "not-here", feather: "Orphan" });
    setup();
    useCommandPaletteStore.getState().open();

    await user.type(await search(), "Orphan");

    expect(await screen.findByRole("option", { name: "Orphan" })).toBeInTheDocument();
  });

  it("still offers pages and actions when the workspace cannot be read", async () => {
    vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(() => {
      throw new DOMException("gone", "InvalidStateError");
    });
    setup();
    useCommandPaletteStore.getState().open();

    expect(await screen.findByRole("option", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "New task" })).toBeInTheDocument();
  });

  it("drops what it read when it was closed before the read came back", async () => {
    const { path } = await ensureDefaultWorkspace();
    await createNotesDirectoryEntry({ branchId: path.branch.id, feather: "Late arrival" });
    setup();

    // Two renders: the read starts when it opens, and it is closed before the read is back.
    act(() => useCommandPaletteStore.getState().open());
    act(() => useCommandPaletteStore.getState().setOpen(false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    useCommandPaletteStore.getState().open();

    expect(await screen.findByRole("option", { name: /Late arrival/ })).toBeInTheDocument();
  });
});
