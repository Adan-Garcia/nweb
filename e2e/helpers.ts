import type { Page } from "@playwright/test";

import { visit } from "./account";
import { expect } from "./fixtures";

const AUTOSAVE_STATUS = /Autosave (enabled|paused while loading|unavailable)|Autosaved at/;

/** Opens the notes page and waits until storage is ready. */
export async function openNotes(page: Page) {
  await visit(page, "/notes");
  await expect(page.getByText(AUTOSAVE_STATUS)).toBeVisible();
  await expect(page.getByText("Autosave unavailable")).toBeHidden();
}

/**
 * Adds a note through the location bar (the last path segment's "Add Note..." menu item).
 * `openFrom` is the note already open, since that is what the menu's trigger is labelled
 * with; it only needs passing when creating a second note in one test. A spatial note is
 * an infinite canvas unless `layout` asks for pages.
 */
export async function createNote(
  page: Page,
  name: string,
  mode: "linear" | "spatial",
  openFrom = "Untitled note",
  layout: "infinite" | "paged" = "infinite",
) {
  // The last path button shows the current note's name.
  await page.getByRole("button", { name: openFrom }).click();
  await page.getByRole("menuitem", { name: "Add Note..." }).click();
  await page.getByPlaceholder("Enter note").fill(name);
  await page.getByRole("button", { name: "Add Note" }).click();
  await page
    .getByRole("button", { name: mode === "spatial" ? "Spatial Note" : "Linear Note" })
    .click();
  if (mode === "spatial") {
    await page
      .getByRole("button", {
        name: layout === "paged" ? "Pages (Letter or A4)" : "Infinite canvas",
      })
      .click();
  }
  await page.getByRole("button", { name: "Create and Open Note" }).click();
  await expect(page.getByRole("button", { name })).toBeVisible();
  // The dialog fades out over the page: a press before it has gone lands on its backdrop.
  await expect(page.getByRole("dialog")).toBeHidden();

  if (mode === "spatial") {
    await expect(drawingCanvas(page)).toBeVisible();
  }
}

/** The canvas that takes input. The scene is drawn on the one beneath it. */
export function drawingCanvas(page: Page) {
  return page.getByRole("img", { name: "Drawing canvas" });
}

/** Waits for an autosave to be reported, so a reload will find the data. */
export async function waitForAutosave(page: Page) {
  await expect(page.getByText(/^Autosaved at/)).toBeVisible();
}

/**
 * How many pixels of the drawn scene are ink: opaque, and on a paged note unlike its
 * paper (the most common colour). Zero means nothing drawn; the faint background dots and
 * lines are translucent, so they never count. Strokes, shapes and images all do.
 */
export async function inkPixels(page: Page): Promise<number> {
  return drawingCanvas(page).evaluate((live) => {
    const canvas = live.previousElementSibling;
    if (!(canvas instanceof HTMLCanvasElement)) {
      return -1;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return -1;
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = new Map<number, number>();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 200) {
        opaque += 1;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    // Paper covers most of a paged note's view; an infinite canvas has none behind its ink.
    const hasPaper = opaque * 4 > data.length * 0.5;
    const [paper] = hasPaper
      ? ([...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1])
      : [-1];

    let inked = 0;
    for (let i = 0; i < data.length; i += 4) {
      const difference =
        paper < 0
          ? 255
          : Math.abs(data[i] - ((paper >> 16) & 255)) +
            Math.abs(data[i + 1] - ((paper >> 8) & 255)) +
            Math.abs(data[i + 2] - (paper & 255));
      // Above what the faint dots blend to on paper (about 90), far below dark ink (700).
      if (data[i + 3] >= 200 && difference > 150) {
        inked += 1;
      }
    }

    return inked;
  });
}

/** Draws one freehand stroke across the middle of the canvas with the pen. */
export async function drawStroke(page: Page, from = { x: 0.4, y: 0.6 }) {
  const box = await drawingCanvas(page).boundingBox();
  if (!box) {
    throw new Error("canvas is not visible");
  }

  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const startX = box.x + box.width * from.x;
  const startY = box.y + box.height * from.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + box.width * 0.25, startY + 40, { steps: 12 });
  await page.mouse.up();
}

/** Drops an image file onto the middle of the canvas, as the browser would. */
export async function dropImage(page: Page) {
  await drawingCanvas(page).evaluate(async (target) => {
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
