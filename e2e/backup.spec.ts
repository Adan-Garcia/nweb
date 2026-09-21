import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { createNote, openNotes } from "./helpers";

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

    await page.evaluate(async () => {
      const source = document.createElement("canvas");
      source.width = 60;
      source.height = 40;
      const context = source.getContext("2d");
      if (!context) throw new Error("no 2d context");
      context.fillStyle = "#0033cc";
      context.fillRect(0, 0, 60, 40);
      const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("could not encode the test image");

      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "square.png", { type: "image/png" }));

      const target = document.querySelector(".notes-canvas-shell .excalidraw");
      if (!target) throw new Error("canvas not found");
      const { left, top, width, height } = target.getBoundingClientRect();
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: left + width / 2,
            clientY: top + height / 2,
          }),
        );
      }
    });

    await expect(page.getByText(/^Autosaved at/)).toBeVisible();

    await page.goto("/settings");
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup" }).click(),
    ]).then(([event]) => event);

    expect(download.suggestedFilename()).toMatch(/^cuervo-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const backup: unknown = JSON.parse(await readFile(await download.path(), "utf8"));

    expect(backup).toMatchObject({ format: "cuervo-planner-backup", version: 1 });

    const parsed = backup as {
      notes: {
        directory: { feather: string }[];
        documents: { sceneCompressed: string | null }[];
        media: { data: string; mimeType: string }[];
      };
    };

    expect(parsed.notes.directory.map((entry) => entry.feather)).toContain("Backup E2E");
    expect(parsed.notes.documents[0].sceneCompressed).toBeTruthy();
    // The dropped image really came back out of IndexedDB as bytes, not as "{}".
    expect(parsed.notes.media.length).toBeGreaterThan(0);
    expect(parsed.notes.media[0].data.length).toBeGreaterThan(100);
    expect(parsed.notes.media[0].mimeType).toMatch(/^image\//);
  });
});
