import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Excalidraw is a canvas app; this page test stays in linear mode, so a minimal stand-in is enough.
vi.mock("@excalidraw/excalidraw", () => ({
  getSceneVersion: () => 0,
  serializeAsJSON: () => "{}",
  convertToExcalidrawElements: () => [],
  Excalidraw: () => null,
  MainMenu: Object.assign(() => null, {
    Item: () => null,
    Separator: () => null,
    DefaultItems: {},
  }),
}));

import { createNotesDirectoryEntry } from "@/lib/notes-directory-storage";
import { ensureDefaultWorkspace } from "@/lib/workspace-storage";

import { NotesPage } from "./notes";

// ProseMirror measures text with layout APIs that jsdom leaves out.
document.elementFromPoint = () => null;
Range.prototype.getClientRects = () => document.body.getClientRects();
Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("NotesPage", () => {
  it("opens the default note in the linear editor once storage is ready", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Lecture Notes")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Autosave enabled|Autosaved at/)).toBeInTheDocument(),
    );
  });

  it("shows the note's place in the hierarchy", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "My Wing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    // A fresh note carries no tag, so the nest level shows the Unfiled group.
    expect(screen.getByRole("button", { name: "Unfiled" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Untitled note" })).toBeInTheDocument();
  });

  it("opens the note a link names, as the command palette sends it", async () => {
    const { path } = await ensureDefaultWorkspace();
    const entry = await createNotesDirectoryEntry({
      branchId: path.branch.id,
      feather: "Chemistry recap",
    });
    // Written after it, so the page would open this one if it ignored the link.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createNotesDirectoryEntry({ branchId: path.branch.id, feather: "Later note" });

    render(
      <MemoryRouter initialEntries={[`/notes?note=${entry.id}`]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Chemistry recap" })).toBeInTheDocument();
  });

  it("navigates by the path bar until the tree is asked for", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "My Wing" })).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Notes file viewer" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tree" }));

    const viewer = await screen.findByRole("complementary", { name: "Notes file viewer" });
    expect(viewer).toBeVisible();
    // The path bar does not go away: the tree is another way in, not a replacement.
    expect(screen.getByRole("button", { name: "My Wing" })).toBeInTheDocument();
  });

  it("lists a saved note in the tree and opens it from there", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "My Wing" });
    await user.click(screen.getByRole("button", { name: "Tree" }));

    const viewer = await screen.findByRole("complementary", { name: "Notes file viewer" });
    expect(within(viewer).getByRole("list", { name: "Saved notes" })).toBeInTheDocument();
    expect(await within(viewer).findByText("Untitled note")).toBeVisible();

    // Opening from the tree lands on the same note the path bar was already showing.
    await user.click(within(viewer).getByRole("button", { name: "Open Untitled note" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Untitled note" })).toBeInTheDocument();
    });
  });

  it("saves the open note from the tree", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "My Wing" });
    await user.click(screen.getByRole("button", { name: "Tree" }));

    const viewer = await screen.findByRole("complementary", { name: "Notes file viewer" });
    const saveNow = within(viewer).getByRole("button", { name: "Save Active Note" });
    await waitFor(() => {
      expect(saveNow).toBeEnabled();
    });

    await user.click(saveNow);

    await waitFor(() => {
      expect(screen.getByText(/Autosaved at/)).toBeInTheDocument();
    });
  });

  it("renames and deletes a note from the tree", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "My Wing" });
    await user.click(screen.getByRole("button", { name: "Tree" }));
    const viewer = await screen.findByRole("complementary", { name: "Notes file viewer" });

    await user.click(within(viewer).getByRole("button", { name: "Rename Untitled note" }));
    const field = within(viewer).getByLabelText("New name for Untitled note");
    await user.clear(field);
    await user.type(field, "Lecture one");
    await user.click(within(viewer).getByRole("button", { name: "Save the new name" }));

    expect(await within(viewer).findByRole("button", { name: "Open Lecture one" })).toBeVisible();

    await user.click(within(viewer).getByRole("button", { name: "Delete Lecture one" }));
    await user.click(within(viewer).getByRole("button", { name: "Delete Lecture one for good" }));

    await waitFor(() => {
      expect(
        within(viewer).queryByRole("button", { name: "Open Lecture one" }),
      ).not.toBeInTheDocument();
    });
  });

  it("remembers the choice for the next visit", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "My Wing" });
    await user.click(screen.getByRole("button", { name: "Tree" }));
    await screen.findByRole("complementary", { name: "Notes file viewer" });
    unmount();

    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("complementary", { name: "Notes file viewer" }),
    ).toBeInTheDocument();
  });
});
