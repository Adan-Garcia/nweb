import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/toaster";
import { resetActiveCipher } from "@/lib/cipher";
import { getNotesDb } from "@/lib/notes-db";
import { unlockWorkspace } from "@/lib/workspace-lock";
import { createWorkspaceLock } from "@/lib/workspace-passphrase";

import { SettingsPage } from "./settings";

// 64 MiB and three passes is what ships. The parameters travel in the lock record, so the
// cheap ones are used to unlock as well.
vi.mock("@/lib/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id",
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

function renderPage(entry = "/settings") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SettingsPage />
      <Toaster />
    </MemoryRouter>,
  );
}

const ENTRY = {
  id: "note-1",
  branchId: "branch-1",
  nestIds: ["nest-1"],
  feather: "Lecture",
  createdMode: "linear" as const,
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
};

let downloaded: { name: string; contents: string } | null = null;

beforeEach(async () => {
  downloaded = null;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  // jsdom has no object URLs, so capture what the download would have written instead.
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    void (blob as Blob).text().then((contents) => {
      downloaded = { name: downloaded?.name ?? "", contents };
    });
    return "blob:stub";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = { name: this.download, contents: downloaded?.contents ?? "" };
  });

  const database = await getNotesDb();
  await database.clear("notes-directory");
  await database.clear("notes-documents");
  await database.clear("notes-media");
  await database.clear("workspace-keys");
  await database.clear("wings");
  window.localStorage.clear();
  resetActiveCipher();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetActiveCipher();
});

describe("SettingsPage", () => {
  it("says plainly that this build has no server to sign in to", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    // No `VITE_API_URL` is compiled into a test build, which is the same state a local
    // build is in: the account card offers nothing and says why rather than going quiet.
    expect(screen.getByText(/no server configured/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
  });

  it("downloads a dated backup of what is stored", async () => {
    const database = await getNotesDb();
    await database.put("notes-directory", ENTRY);
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /Download backup/ }));

    expect(await screen.findByText("Backup downloaded")).toBeInTheDocument();
    expect(screen.getByText("1 notes and 0 tasks, unencrypted.")).toBeInTheDocument();
    expect(downloaded?.name).toMatch(/^cuervo-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("opens the file picker from the restore button", async () => {
    renderPage();
    const input = screen.getByLabelText("Backup file");
    const openPicker = vi.spyOn(input, "click").mockImplementation(() => {});

    await userEvent.click(screen.getByRole("button", { name: /Restore from file/ }));

    expect(openPicker).toHaveBeenCalledOnce();
  });

  it("restores a backup file and reports what came back", async () => {
    renderPage();
    const backup = {
      format: "cuervo-planner-backup",
      version: 1,
      exportedAt: "2026-09-20T00:00:00.000Z",
      notes: { directory: [ENTRY], documents: [], media: [] },
      calendar: [],
    };

    await userEvent.upload(
      screen.getByLabelText("Backup file"),
      new File([JSON.stringify(backup)], "backup.json", { type: "application/json" }),
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Restored 1 notes"));
    const database = await getNotesDb();
    expect(await database.get("notes-directory", ENTRY.id)).toEqual(ENTRY);
  });

  it("refuses a file that is not a backup and changes nothing", async () => {
    renderPage();

    await userEvent.upload(
      screen.getByLabelText("Backup file"),
      new File(["{}"], "notes.json", { type: "application/json" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("not a Cuervo Planner backup"),
    );
    const database = await getNotesDb();
    expect(await database.count("notes-directory")).toBe(0);
  });

  it("wires the workspace editor to storage", async () => {
    const database = await getNotesDb();
    await database.clear("wings");
    await database.put("wings", {
      id: "wing-1",
      name: "My Wing",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Rename My Wing" }));
    const field = screen.getByLabelText("New name for My Wing");
    await userEvent.clear(field);
    await userEvent.type(field, "Second Year");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await database.get("wings", "wing-1"))?.name).toBe("Second Year");
    });
  });

  it("changes the workspace passphrase from the lock card", async () => {
    // Creating the lock leaves the workspace unlocked, which is the state the card offers
    // a change from — and the state the settings page is reachable in at all.
    await createWorkspaceLock("correct horse");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Change the passphrase" }));
    await userEvent.type(screen.getByLabelText("Current passphrase"), "correct horse");
    await userEvent.type(screen.getByLabelText("New passphrase"), "battery staple");
    await userEvent.click(
      screen.getByRole("button", { name: "Re-encrypt with the new passphrase" }),
    );

    await waitFor(async () => {
      expect(await unlockWorkspace("battery staple")).toBe(true);
    });
    expect(await unlockWorkspace("correct horse")).toBe(false);
  });

  it("locks and removes the passphrase from the card", async () => {
    await createWorkspaceLock("correct horse");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Remove the passphrase" }));
    await userEvent.type(screen.getByLabelText("Confirm the passphrase"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Remove and decrypt" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Set a passphrase" })).toBeInTheDocument();
    });
  });

  it("merges a backup instead of replacing when that is what was chosen", async () => {
    const database = await getNotesDb();
    await database.put("notes-directory", { ...ENTRY, feather: "Written here", updatedAt: 99 });
    renderPage();

    await userEvent.click(screen.getByRole("radio", { name: /Merge with what is here/ }));

    const backup = {
      format: "cuervo-planner-backup",
      version: 2,
      exportedAt: "2026-09-20T00:00:00.000Z",
      notes: { directory: [ENTRY], documents: [], media: [] },
      workspace: { wings: [], flights: [], branches: [], nests: [] },
      twigs: [],
      pebbles: [],
      calendar: [],
    };

    await userEvent.upload(
      screen.getByLabelText("Backup file"),
      new File([JSON.stringify(backup)], "backup.json", { type: "application/json" }),
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Merged"));
    // The copy here is newer, so the file did not overwrite it.
    expect((await database.get("notes-directory", ENTRY.id))?.feather).toBe("Written here");
  });

  it("reports a file it cannot read as text", async () => {
    renderPage();
    const file = new File(["x"], "broken.json", { type: "application/json" });
    vi.spyOn(file, "text").mockRejectedValue(new Error("unreadable"));

    await userEvent.upload(screen.getByLabelText("Backup file"), file);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Could not read that file."),
    );
  });
});

describe("SettingsPage layout", () => {
  it("lists its sections and puts each one under its anchor", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });

    for (const [name, id] of [
      ["Appearance", "appearance"],
      ["Workspace", "workspace"],
      ["Security", "security"],
      ["Backup", "backup"],
      ["Account & sync", "account"],
      ["Sharing", "sharing"],
      ["Reminders", "reminders"],
    ]) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", `#${id}`);
      expect(screen.getByRole("region", { name })).toHaveAttribute("id", id);
    }
  });

  it("opens at the section the link names, and marks it in the nav", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    renderPage("/settings#backup");

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("region", { name: "Backup" }));
    expect(screen.getByRole("link", { name: "Backup" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("marks the first section when the link names none it knows", () => {
    renderPage("/settings#nowhere");

    expect(screen.getByRole("link", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("holds the appearance settings", () => {
    renderPage();

    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Accent colour" })).toBeInTheDocument();
  });
});
