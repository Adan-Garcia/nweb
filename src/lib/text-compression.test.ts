// @vitest-environment node
//
// Node, not jsdom: brotli-wasm and the real CompressionStream both work here, so this
// suite compresses for real rather than around a stub.
import { afterEach, describe, expect, it, vi } from "vitest";

import { compressText, decompressText, loadBrotli, resetBrotliForTests } from "./text-compression";

/** Repetitive enough that any real compressor beats the raw bytes comfortably. */
const LONG_TEXT = "<p>Lecture notes about compression.</p>".repeat(60);

afterEach(() => {
  resetBrotliForTests();
  vi.restoreAllMocks();
});

describe("compressText", () => {
  it("uses brotli, which is the whole point of the WASM module", async () => {
    const { algorithm, buffer } = await compressText(LONG_TEXT);

    expect(algorithm).toBe("brotli");
    expect(buffer.byteLength).toBeLessThan(LONG_TEXT.length);
  });

  it("round-trips exactly, including text that is not ASCII", async () => {
    const text = "Notes — with an em dash, “smart quotes”, an emoji 🪶 and 日本語.";
    const { algorithm, buffer } = await compressText(text);

    expect(await decompressText(buffer, algorithm)).toBe(text);
  });

  it("round-trips an empty string", async () => {
    const { algorithm, buffer } = await compressText("");

    expect(await decompressText(buffer, algorithm)).toBe("");
  });

  it("beats gzip on the kind of text a note actually holds", async () => {
    const brotli = await compressText(LONG_TEXT);

    const source = new TextEncoder().encode(LONG_TEXT);
    const gzipStream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
    const gzip = await new Response(gzipStream).arrayBuffer();

    expect(brotli.buffer.byteLength).toBeLessThan(gzip.byteLength);
  });
});

describe("falling back", () => {
  it("drops to gzip when the WASM cannot be loaded", async () => {
    vi.doMock("brotli-wasm", () => {
      throw new Error("wasm blocked");
    });
    // A fresh copy of the module, so it loads the mocked dependency rather than the
    // instance this file already imported.
    vi.resetModules();

    const fresh = await import("./text-compression");
    const { algorithm, buffer } = await fresh.compressText(LONG_TEXT);

    expect(algorithm).toBe("gzip");
    expect(await fresh.decompressText(buffer, algorithm)).toBe(LONG_TEXT);

    vi.doUnmock("brotli-wasm");
    vi.resetModules();
  });

  it("stores the text uncompressed rather than failing when nothing at all works", async () => {
    vi.doMock("brotli-wasm", () => {
      throw new Error("wasm blocked");
    });
    vi.resetModules();
    vi.stubGlobal("CompressionStream", undefined);

    const fresh = await import("./text-compression");
    const { algorithm, buffer } = await fresh.compressText("hello");

    expect(algorithm).toBe("none");
    expect(new TextDecoder().decode(buffer)).toBe("hello");

    vi.unstubAllGlobals();
    vi.doUnmock("brotli-wasm");
    vi.resetModules();
  });
});

describe("decompressText", () => {
  it("reads back what gzip wrote, so notes stored before brotli still open", async () => {
    const source = new TextEncoder().encode(LONG_TEXT);
    const stream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
    const gzipped = await new Response(stream).arrayBuffer();

    expect(await decompressText(gzipped, "gzip")).toBe(LONG_TEXT);
  });

  it("passes through an uncompressed buffer", async () => {
    const buffer = new TextEncoder().encode("plain").slice().buffer;

    expect(await decompressText(buffer, "none")).toBe("plain");
  });

  it('accepts "br" as well as "brotli", which the old preference list would have written', async () => {
    const brotli = await loadBrotli();
    const compressed = brotli!.compress(new TextEncoder().encode(LONG_TEXT));

    expect(await decompressText(compressed.slice().buffer, "br")).toBe(LONG_TEXT);
  });

  it("decodes the raw bytes rather than losing a note it cannot decompress", async () => {
    const notCompressed = new TextEncoder().encode("readable after all").slice().buffer;

    expect(await decompressText(notCompressed, "gzip")).toBe("readable after all");
    expect(await decompressText(notCompressed, "brotli")).toBe("readable after all");
  });
});
