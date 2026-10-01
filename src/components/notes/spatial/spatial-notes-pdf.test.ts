import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.fn();
const workerOptions = { workerSrc: "" };

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: workerOptions,
  getDocument: (options: unknown) => getDocument(options) as unknown,
}));

import { describePdfInsert, type RenderedPdfPage, renderPdfPagesToPng } from "./spatial-notes-pdf";

// jsdom has no canvas: give it a 2D context and a data URL encoder, and restore them afterwards.
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);
const originalToDataURL = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toDataURL");

function stubCanvas(context: object | null = {}) {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value(this: HTMLCanvasElement) {
      return `data:image/png;base64,${this.width}x${this.height}`;
    },
  });
}

// A fake pdf.js document whose pages are `pageWidth` x `pageHeight` at scale 1.
function fakePdf({
  numPages,
  pageWidth = 600,
  pageHeight = 800,
}: {
  numPages: number;
  pageWidth?: number;
  pageHeight?: number;
}) {
  const scales: number[] = [];
  const pdf = {
    numPages,
    getPage: vi.fn((pageNumber: number) =>
      Promise.resolve({
        pageNumber,
        getViewport: ({ scale }: { scale: number }) => {
          scales.push(scale);
          return { width: pageWidth * scale, height: pageHeight * scale };
        },
        render: () => ({ promise: Promise.resolve() }),
      }),
    ),
  };
  const destroy = vi.fn(() => Promise.resolve());
  getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
  return { pdf, destroy, scales };
}

const pdfFile = () => new File(["%PDF"], "notes.pdf", { type: "application/pdf" });

beforeEach(() => {
  getDocument.mockReset();
  stubCanvas();
});

afterEach(() => {
  if (originalGetContext)
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  if (originalToDataURL)
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", originalToDataURL);
  vi.restoreAllMocks();
});

describe("renderPdfPagesToPng", () => {
  it("renders a one-page PDF without asking which pages", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const { destroy } = fakePdf({ numPages: 1 });

    const pages = await renderPdfPagesToPng(pdfFile());

    expect(prompt).not.toHaveBeenCalled();
    expect(pages).toEqual([
      {
        dataUrl: "data:image/png;base64,600x800",
        width: 600,
        height: 800,
        pageNumber: 1,
        totalPages: 1,
      },
    ]);
    expect(getDocument).toHaveBeenCalledOnce();
    expect(getDocument.mock.calls[0][0]).toHaveProperty("data");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("asks which pages to import from a longer PDF, and renders them in order", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("3, 1");
    const { pdf } = fakePdf({ numPages: 5 });

    const pages = await renderPdfPagesToPng(pdfFile());

    expect(prompt).toHaveBeenCalledWith(
      "This PDF has 5 pages. Enter pages (examples: 1, 3-5, all):",
      "1",
    );
    expect(pdf.getPage.mock.calls.map(([n]) => n)).toEqual([1, 3]);
    expect(pages?.map((page) => [page.pageNumber, page.totalPages])).toEqual([
      [1, 5],
      [3, 5],
    ]);
  });

  it("returns null, and still cleans up, when the page prompt is cancelled", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const { destroy, pdf } = fakePdf({ numPages: 3 });

    expect(await renderPdfPagesToPng(pdfFile())).toBeNull();
    expect(pdf.getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects an invalid page selection, and still cleans up", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("99");
    const { destroy } = fakePdf({ numPages: 3 });

    await expect(renderPdfPagesToPng(pdfFile())).rejects.toThrow("Invalid page number.");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("fails clearly when a 2D canvas context is unavailable, and still cleans up", async () => {
    stubCanvas(null);
    const { destroy } = fakePdf({ numPages: 1 });

    await expect(renderPdfPagesToPng(pdfFile())).rejects.toThrow(
      "Could not get a 2D canvas context.",
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("renders very large pages at a reduced scale", async () => {
    const { scales } = fakePdf({ numPages: 1, pageWidth: 3600, pageHeight: 1000 });

    const pages = await renderPdfPagesToPng(pdfFile());

    expect(scales).toEqual([1, 0.5]);
    expect(pages?.[0]).toMatchObject({ width: 1800, height: 500 });
  });

  it("points pdf.js at its worker script", async () => {
    fakePdf({ numPages: 1 });
    await renderPdfPagesToPng(pdfFile());
    expect(workerOptions.workerSrc).toContain("pdf.worker");
  });
});

function page(pageNumber: number, totalPages: number): RenderedPdfPage {
  return {
    dataUrl: `data:image/png;base64,p${pageNumber}`,
    width: 500,
    height: 700,
    pageNumber,
    totalPages,
  };
}

describe("describePdfInsert", () => {
  it("summarizes a multi-page insert", () => {
    expect(describePdfInsert([page(3, 9), page(4, 9), page(5, 9)])).toBe("Inserted 3 pages (3-5).");
  });

  it("names the single page inserted from a longer document", () => {
    expect(describePdfInsert([page(4, 9)])).toBe("Inserted page 4 of 9.");
  });

  it("stays quiet for a one-page document", () => {
    expect(describePdfInsert([page(1, 1)])).toBeNull();
  });
});
