import { readFile } from "node:fs/promises";

import { visit } from "./account";
import { expect, test } from "./fixtures";
import { createNote, dropImage, openNotes } from "./helpers";

/**
 * jsdom cannot cover this: fake-indexeddb's structured clone strips a jsdom Blob down to a
 * bare object, so the unit tests never exercise reading a real stored Blob back out. Only a
 * real browser proves the media in a note survives the export.
 */
test.describe("exporting and restoring the workspace", () => {
  test("writes a backup file that carries the notes, the media and the calendar", async ({
    page,
  }) => {
    await openNotes(page);
    await createNote(page, "Backup E2E", "spatial");

    await dropImage(page);

    await expect(page.getByText(/^Autosaved at/)).toBeVisible();

    await visit(page, "/settings");
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup" }).click(),
    ]).then(([event]) => event);

    expect(download.suggestedFilename()).toMatch(/^cuervo-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const backup: unknown = JSON.parse(await readFile(await download.path(), "utf8"));

    expect(backup).toMatchObject({ format: "cuervo-planner-backup", version: 2 });

    const parsed = backup as {
      notes: {
        directory: { feather: string; branchId: string }[];
        documents: { sceneCompressed: string | null }[];
        media: { data: string; mimeType: string }[];
      };
      workspace: { wings: { id: string }[]; branches: { id: string }[] };
    };

    const note = parsed.notes.directory.find((entry) => entry.feather === "Backup E2E");
    expect(note).toBeDefined();

    // The note carries a branch id, and that branch really travelled in the file, so the
    // path can be rebuilt on restore rather than being re-derived from strings.
    expect(parsed.workspace.branches.map((branch) => branch.id)).toContain(note?.branchId);
    expect(parsed.workspace.wings.length).toBeGreaterThan(0);
    expect(parsed.notes.documents[0].sceneCompressed).toBeTruthy();
    // The dropped image really came back out of IndexedDB as bytes, not as "{}".
    expect(parsed.notes.media.length).toBeGreaterThan(0);
    expect(parsed.notes.media[0].data.length).toBeGreaterThan(100);
    expect(parsed.notes.media[0].mimeType).toMatch(/^image\//);
  });
});
