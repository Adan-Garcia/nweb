import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

const AUTOSAVE_STATUS = /Autosave (enabled|paused while loading|unavailable)|Autosaved at/;

/** Opens the notes page and waits until storage is ready. */
export async function openNotes(page: Page) {
  await page.goto("/notes");
  await expect(page.getByText(AUTOSAVE_STATUS)).toBeVisible();
  await expect(page.getByText("Autosave unavailable")).toBeHidden();
}

/** Adds a note through the location bar (the last path segment's "Add Note..." menu item). */
export async function createNote(page: Page, name: string, mode: "linear" | "spatial") {
  // The last path button shows the current note's name.
  await page.getByRole("button", { name: "Untitled note" }).click();
  await page.getByRole("menuitem", { name: "Add Note..." }).click();
  await page.getByPlaceholder("Enter note").fill(name);
  await page.getByRole("button", { name: "Add Note" }).click();
  await page
    .getByRole("button", { name: mode === "spatial" ? "Spatial Note" : "Linear Note" })
    .click();
  await page.getByRole("button", { name: "Create and Open Note" }).click();
  await expect(page.getByRole("button", { name })).toBeVisible();

  if (mode === "spatial") {
    await expect(page.locator(".notes-canvas-shell .excalidraw")).toBeVisible();
    await expect(page.locator(".notes-canvas-shell canvas.static")).toBeVisible();
  }
}

/** Waits for an autosave to be reported, so a reload will find the data. */
export async function waitForAutosave(page: Page) {
  await expect(page.getByText(/^Autosaved at/)).toBeVisible();
}

/**
 * How many pixels of Excalidraw's drawing canvas differ from its background. Zero means an empty
 * canvas; strokes, shapes and images all raise it.
 */
export async function inkPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".notes-canvas-shell canvas.static");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return -1;
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    for (let i = 0; i < data.length; i += 4) {
      const difference =
        Math.abs(data[i] - data[0]) +
        Math.abs(data[i + 1] - data[1]) +
        Math.abs(data[i + 2] - data[2]) +
        Math.abs(data[i + 3] - data[3]);
      if (difference > 60) {
        inked += 1;
      }
    }

    return inked;
  });
}

/** Draws one freehand stroke across the middle of the canvas with the pen tool. */
export async function drawStroke(page: Page) {
  const canvas = page.locator(".notes-canvas-shell canvas.interactive");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("canvas is not visible");
  }

  // Start right of centre: choosing a tool opens Excalidraw's properties panel over the left of
  // the canvas, and whether it has rendered yet depends on load.
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.6;

  // The tool buttons are radio inputs hidden behind a styled label; click the label like a user.
  await page.locator("label.ToolIcon", { has: page.getByTestId("toolbar-freedraw") }).click();
  await expect(page.getByTestId("toolbar-freedraw")).toBeChecked();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + box.width * 0.25, startY + 40, { steps: 12 });
  await page.mouse.up();
}

/** A minimal but valid PDF with `pages` pages, each a black block plus the text "Page N". */
export function makePdf(pages: number): Buffer {
  const objects: string[] = [];
  const fontId = 3 + pages * 2;
  const pageIds = Array.from({ length: pages }, (_, index) => 3 + index * 2);

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`,
  );
  pageIds.forEach((id, index) => {
    // A filled block renders without any font data (pdf.js cannot draw the standard Helvetica
    // here), so a page is visibly inked; the text is there for realism.
    const stream = `0 0 0 rg 72 560 320 160 re f BT /F1 36 Tf 72 500 Td (Page ${index + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${id + 1} 0 R ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}
