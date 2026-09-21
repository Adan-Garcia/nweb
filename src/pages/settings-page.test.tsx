import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/notes-db";

import { SettingsPage } from "./settings";

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

const ENTRY = {
  id: "notes-home-fall-2026-math-unit-1-lecture",
  wing: "Home",
  flight: "Fall 2026",
  branch: "Math",
  nest: "Unit 1",
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
});

afterEach(() => {
  vi.restoreAllMocks();
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
