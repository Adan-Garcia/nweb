/**
 * The smallest PDF that holds pictures of pages: one JPEG per page, drawn to fill it. pdf.js
 * only reads PDFs, and a picture per page is all an export of handwriting needs, so this is
 * written by hand rather than adding a library for it.
 */
export type PdfPage = {
  /** The page's size in points (1/72 inch). */
  width: number;
  height: number;
  /** A baseline JPEG and its size in pixels. */
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
};

const encoder = new TextEncoder();

const number = (value: number) => String(Math.round(value * 100) / 100);

/** Builds the file. Objects are numbered 1 catalog, 2 page tree, then three per page. */
export function writePdf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, ...body: Array<Uint8Array | string>) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of body) {
      push(part);
    }
    push("\nendobj\n");
  };

  // The binary comment marks the file as binary for tools that guess.
  push("%PDF-1.4\n%âãÏÓ\n");
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((page, i) => {
    const [pageId, contentId, imageId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const [width, height] = [number(page.width), number(page.height)];
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;

    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    object(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      "\nendstream",
    );
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const file = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    file.set(chunk, at);
    at += chunk.length;
  }

  return file;
}
