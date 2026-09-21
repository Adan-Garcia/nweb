import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
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
  it("says plainly that there is no account and no server", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText(/There is no account yet/)).toBeInTheDocument();
  });

  it("downloads a dated backup of what is stored", async () => {
    const database = await getNotesDb();
    await database.put("notes-directory", ENTRY);
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /Download backup/ }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved 1 notes"));
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
