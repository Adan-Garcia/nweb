// @vitest-environment node
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { writePdf } from "./pdf-writer";

const page = (width: number, height: number) => ({
  width,
  height,
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  pixelWidth: 2,
  pixelHeight: 3,
});

describe("writePdf", () => {
  const file = writePdf([page(612, 792), page(841.89, 595.28)]);
  const text = new TextDecoder("latin1").decode(file);

  it("points every cross-reference entry at the object it names", () => {
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    const entries = text.slice(xref).split("\n").slice(3, 11);

    expect(text.slice(xref, xref + 4)).toBe("xref");
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`);
    });
  });

  it("is a PDF pdf.js opens, with each page the size it was given", async () => {
    const task = getDocument({ data: file.slice() });
    const pdf = await task.promise;

    expect(pdf.numPages).toBe(2);
    expect((await pdf.getPage(1)).view).toEqual([0, 0, 612, 792]);
    expect((await pdf.getPage(2)).view).toEqual([0, 0, 841.89, 595.28]);
    await task.destroy();
  });
});
