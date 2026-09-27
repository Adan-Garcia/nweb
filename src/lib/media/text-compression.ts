/**
 * Text compression for stored notes.
 *
 * The algorithm is recorded on every row, so what was written with one can still be read
 * after the preferred one changes. That is what makes this safe to reorder.
 *
 * Brotli comes from WASM because no browser exposes it through `CompressionStream`:
 * Chromium rejects both "br" and "brotli" there (checked with Playwright:
 * `br:false, brotli:false, gzip:true`), which is why the old preference list silently fell
 * all the way through to gzip and the "Brotli compression" claim was not true.
 */
export const COMPRESSION_ALGORITHMS = ["brotli", "gzip", "deflate", "none"] as const;

export type CompressionAlgorithm = (typeof COMPRESSION_ALGORITHMS)[number];

export type CompressedText = {
  algorithm: string;
  buffer: ArrayBuffer;
};

type BrotliModule = {
  compress: (input: Uint8Array) => Uint8Array;
  decompress: (input: Uint8Array) => Uint8Array;
};

let brotliPromise: Promise<BrotliModule | null> | null = null;

/**
 * Loaded on first use and kept, so the WASM is fetched once and never on a path that does
 * not compress. A failure is cached as "unavailable" rather than retried on every note.
 */
export function loadBrotli(): Promise<BrotliModule | null> {
  brotliPromise ??= import("brotli-wasm").then((module) => module.default).catch(() => null);

  return brotliPromise;
}

/** Test seam: forgets the cached module so a failure can be exercised. */
export function resetBrotliForTests() {
  brotliPromise = null;
}

async function compressWithStream(
  source: Uint8Array,
  algorithm: string,
): Promise<ArrayBuffer | null> {
  try {
    const compressionStream = new CompressionStream(algorithm as CompressionFormat);
    const stream = new Blob([Uint8Array.from(source)]).stream().pipeThrough(compressionStream);

    return await new Response(stream).arrayBuffer();
  } catch {
    return null;
  }
}

async function decompressWithStream(
  buffer: ArrayBuffer,
  algorithm: string,
): Promise<ArrayBuffer | null> {
  try {
    const decompressionStream = new DecompressionStream(algorithm as CompressionFormat);
    const stream = new Blob([buffer]).stream().pipeThrough(decompressionStream);

    return await new Response(stream).arrayBuffer();
  } catch {
    return null;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/** Brotli first, then whatever the browser will do, and uncompressed rather than nothing. */
export async function compressText(text: string): Promise<CompressedText> {
  const source = new TextEncoder().encode(text);
  const brotli = await loadBrotli();

  if (brotli) {
    try {
      return { algorithm: "brotli", buffer: toArrayBuffer(brotli.compress(source)) };
    } catch {
      // Fall through to the stream formats below.
    }
  }

  for (const algorithm of ["gzip", "deflate"]) {
    const compressed = await compressWithStream(source, algorithm);

    if (compressed) {
      return { algorithm, buffer: compressed };
    }
  }

  return { algorithm: "none", buffer: toArrayBuffer(source) };
}

/**
 * Reads back whatever was written. "br" is accepted alongside "brotli" because the old
 * preference list would have recorded it had any browser ever accepted it.
 *
 * A buffer that cannot be decompressed is decoded as text rather than thrown away: it is
 * more likely to be readable content than not, and losing a note is the worse failure.
 */
export async function decompressText(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  if (algorithm === "none") {
    return new TextDecoder().decode(buffer);
  }

  if (algorithm === "brotli" || algorithm === "br") {
    const brotli = await loadBrotli();

    if (brotli) {
      try {
        return new TextDecoder().decode(brotli.decompress(new Uint8Array(buffer)));
      } catch {
        return new TextDecoder().decode(buffer);
      }
    }
  }

  const decompressed = await decompressWithStream(buffer, algorithm);

  return new TextDecoder().decode(decompressed ?? buffer);
}
