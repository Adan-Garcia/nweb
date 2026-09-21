import { expect, test } from "./fixtures";
import { createNote, inkPixels, openNotes } from "./helpers";

test.describe("dropping an image onto the canvas", () => {
  test("adds the image, optimizes it in the worker, and keeps it after a reload", async ({
    page,
  }) => {
    await openNotes(page);
    await createNote(page, "Drop E2E", "spatial");
    expect(await inkPixels(page)).toBe(0);

    // A real drop: build a PNG in the page and dispatch the drag events Excalidraw listens for.
    await page.evaluate(async () => {
      const source = document.createElement("canvas");
      source.width = 120;
      source.height = 90;
      const context = source.getContext("2d");
      if (!context) throw new Error("no 2d context");
      context.fillStyle = "#cc0000";
      context.fillRect(0, 0, 120, 90);
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

    await expect.poll(() => inkPixels(page)).toBeGreaterThan(2000);
    await expect(page.getByText(/^Autosaved at/)).toBeVisible();

    await page.reload();

    await expect(page.getByRole("button", { name: "Drop E2E" })).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(2000);
  });
});
