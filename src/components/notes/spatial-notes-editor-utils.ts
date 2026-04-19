export const MIN_PEN_WIDTH = 0.5;
export const MAX_PEN_WIDTH = 8;
export const DEFAULT_PEN_WIDTH = 1;
export const PEN_WIDTH_STEP = 0.25;

export function fitWithinBounds(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (width <= 0 || height <= 0) {
    return {
      width: 1,
      height: 1,
    };
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isPdfEmbeddableUrl(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url, "https://example.com");
    const pathname = parsed.pathname.toLowerCase();

    if (pathname.endsWith(".pdf")) {
      return true;
    }

    const format = parsed.searchParams.get("format")?.toLowerCase();
    const extension = parsed.searchParams.get("ext")?.toLowerCase();
    const mime = parsed.searchParams.get("mime")?.toLowerCase();

    return (
      format === "pdf" || extension === "pdf" || mime === "application/pdf"
    );
  } catch {
    return false;
  }
}

export function clampPenWidth(value: number) {
  if (Number.isNaN(value)) {
    return DEFAULT_PEN_WIDTH;
  }

  return Math.min(MAX_PEN_WIDTH, Math.max(MIN_PEN_WIDTH, value));
}

export function parsePdfPageSelection(input: string, totalPages: number) {
  const normalizedInput = input.trim().toLowerCase();

  if (!normalizedInput.length) {
    return [1];
  }

  if (normalizedInput === "all") {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pageSet = new Set<number>();

  for (const part of normalizedInput.split(",")) {
    const token = part.trim();
    if (!token.length) {
      continue;
    }

    if (!token.includes("-")) {
      const pageNumber = Number.parseInt(token, 10);

      if (
        Number.isNaN(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > totalPages
      ) {
        throw new Error("Invalid page number.");
      }

      pageSet.add(pageNumber);
      continue;
    }

    const [startToken, endToken, ...extraTokens] = token
      .split("-")
      .map((segment) => segment.trim());

    if (
      extraTokens.length ||
      !startToken ||
      !endToken ||
      Number.isNaN(Number.parseInt(startToken, 10)) ||
      Number.isNaN(Number.parseInt(endToken, 10))
    ) {
      throw new Error("Invalid page range.");
    }

    const startPage = Number.parseInt(startToken, 10);
    const endPage = Number.parseInt(endToken, 10);
    const minPage = Math.min(startPage, endPage);
    const maxPage = Math.max(startPage, endPage);

    if (minPage < 1 || maxPage > totalPages) {
      throw new Error("Page range is out of bounds.");
    }

    for (let pageNumber = minPage; pageNumber <= maxPage; pageNumber += 1) {
      pageSet.add(pageNumber);
    }
  }

  if (!pageSet.size) {
    throw new Error("No pages were selected.");
  }

  return Array.from(pageSet).sort((left, right) => left - right);
}
