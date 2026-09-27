import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/shell/toaster";
import { createLocalAccount } from "@/lib/account/device-account";
import { readLocalAccount } from "@/lib/account/local-account";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { getWorkspaceLockState, unlockWorkspace } from "@/lib/lock/workspace-lock";

import { SettingsPage } from "./settings";

// 64 MiB and three passes is what ships. The parameters travel in the lock record, so the
// cheap ones are used to unlock as well.
vi.mock("@/lib/crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto/kdf")>()),
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
  await database.clear("local-account");
  window.localStorage.clear();
  resetActiveCipher();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetActiveCipher();
});

describe("SettingsPage", () => {
  it("says plainly when no server is chosen, and offers one once it is", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    // No `VITE_API_URL` is compiled into a test build, which is the same state a local
    // build is in: the sync card offers nothing to sign in to and says why.
    expect(
      await screen.findByText("No server: this device keeps everything to itself."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();

    const sync = screen.getByRole("region", { name: "Sync server" });
    await userEvent.type(within(sync).getByLabelText("Server address"), "https://sync.example.org");
    await userEvent.click(within(sync).getByRole("button", { name: "Save" }));

    expect(await within(sync).findByRole("button", { name: "Create an account" })).toBeEnabled();
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
    await userEvent.click(
      within(screen.getByRole("region", { name: "Workspace" })).getByRole("button", {
        name: "Save",
      }),
    );

    await waitFor(async () => {
      expect((await database.get("wings", "wing-1"))?.name).toBe("Second Year");
    });
  });

  it("changes the device's passphrase from the account card", async () => {
    // Setting up the account leaves the workspace unlocked, which is the state the settings
    // page is reachable in at all.
    await createLocalAccount({
      name: "Ada",
      email: "ada@example.com",
      passphrase: "correct horse",
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Change passphrase" }));
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

  it("edits the account's name and locks the device from its card", async () => {
    await createLocalAccount({
      name: "Ada",
      email: "ada@example.com",
      passphrase: "correct horse",
    });
    renderPage();

    const account = screen.getByRole("region", { name: "Account" });
    const name = await within(account).findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Ada Lovelace");
    await userEvent.click(within(account).getByRole("button", { name: "Save" }));

    await waitFor(async () => expect((await readLocalAccount())?.name).toBe("Ada Lovelace"));

    await userEvent.click(within(account).getByRole("button", { name: "Lock now" }));
    await waitFor(async () => expect(await getWorkspaceLockState()).toBe("locked"));
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
      ["Account", "account"],
      ["Sync server", "sync"],
      ["Workspace", "workspace"],
      ["Backup", "backup"],
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
