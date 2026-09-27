// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DecompressTextRequest,
  OptimizeImageRequest,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/media/media-worker-protocol";

// The worker registers itself on the global scope, which is `self` in a real worker.
// A setter on `onmessage` lets us capture the handler it installs.
type Handler = (event: MessageEvent<WorkerRequest>) => void;
let handler: Handler | null = null;
const postMessage = vi.fn<(response: WorkerResponse, transfer?: Transferable[]) => void>();
let nextId = 0;

beforeAll(async () => {
  Object.defineProperty(globalThis, "onmessage", {
    configurable: true,
    set(value: Handler) {
      handler = value;
    },
  });
  vi.stubGlobal("self", globalThis);
  await import("./media-worker");
});

beforeEach(() => {
  postMessage.mockClear();
  vi.stubGlobal("postMessage", postMessage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("self", globalThis);
});

async function dispatch(request: WorkerRequest): Promise<WorkerResponse> {
  handler?.(new MessageEvent("message", { data: request }));
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
  const [response] = postMessage.mock.calls[0];
  expect(response.id).toBe(request.id);
  return response;
}

const compress = (text: string) =>
  dispatch({ id: ++nextId, type: "compress-text", payload: { text } });
const decompress = (payload: DecompressTextRequest["payload"]) =>
  dispatch({ id: ++nextId, type: "decompress-text", payload });
const optimize = (payload: OptimizeImageRequest["payload"]) =>
  dispatch({ id: ++nextId, type: "optimize-image", payload });

const bytes = (text: string) => new TextEncoder().encode(text).slice().buffer;

describe("compress-text / decompress-text", () => {
  it("compresses text and restores it losslessly", async () => {
    const original = "notes ".repeat(200);
    const compressed = await compress(original);

    expect(compressed).toMatchObject({ ok: true, type: "compress-text" });
    if (!compressed.ok || compressed.type !== "compress-text") throw new Error("unexpected");
    expect(compressed.payload.algorithm).not.toBe("none");
    expect(compressed.payload.buffer.byteLength).toBeLessThan(original.length);

    postMessage.mockClear();
    const restored = await decompress({
      buffer: compressed.payload.buffer,
      algorithm: compressed.payload.algorithm,
    });

    expect(restored).toMatchObject({ ok: true, type: "decompress-text" });
    if (!restored.ok || restored.type !== "decompress-text") throw new Error("unexpected");
    expect(restored.payload.text).toBe(original);
  });

  it("transfers the compressed buffer instead of copying it", async () => {
    await compress("hello");
    const [response, transfer] = postMessage.mock.calls[0];
    if (!response.ok || response.type !== "compress-text") throw new Error("unexpected");
    expect(transfer).toEqual([response.payload.buffer]);
  });

  it("decodes plainly when the algorithm is 'none'", async () => {
    const response = await decompress({ buffer: bytes("plain"), algorithm: "none" });
    expect(response).toMatchObject({ ok: true, payload: { text: "plain" } });
  });

  it("falls back to decoding the bytes as text when they are not valid compressed data", async () => {
    const response = await decompress({ buffer: bytes("not gzip"), algorithm: "gzip" });
    expect(response).toMatchObject({ ok: true, payload: { text: "not gzip" } });
  });

  it("compresses with brotli, which no browser offers through CompressionStream", async () => {
    // Stubbed away to prove the worker is not quietly falling through to gzip, which is
    // what it did for as long as "br" was only ever asked of CompressionStream.
    vi.stubGlobal("CompressionStream", undefined);

    const response = await compress("notes ".repeat(200));

    if (!response.ok || response.type !== "compress-text") throw new Error("unexpected");
    expect(response.payload.algorithm).toBe("brotli");
  });
});

describe("optimize-image", () => {
  const png = () => ({ buffer: bytes("png-bytes"), mimeType: "image/png" });

  it("returns the image unchanged when the browser cannot convert it", async () => {
    const response = await optimize(png());
    expect(response).toMatchObject({
      ok: true,
      type: "optimize-image",
      payload: { mimeType: "image/png" },
    });
  });

  it("leaves webp and non-image files alone even when conversion is available", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    vi.stubGlobal("OffscreenCanvas", class {});

    await optimize({ buffer: bytes("w"), mimeType: "image/webp" });
    postMessage.mockClear();
    await optimize({ buffer: bytes("t"), mimeType: "text/plain" });

    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  function stubConversion(context: { drawImage: () => void } | null) {
    const close = vi.fn();
    const convertToBlob = vi.fn(() =>
      Promise.resolve(new Blob(["converted"], { type: "image/webp" })),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 4, height: 2, close })),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return context;
        }
        convertToBlob = convertToBlob;
      },
    );
    return { close, convertToBlob };
  }

  it("draws to an offscreen canvas and returns webp at the requested quality", async () => {
    const { close, convertToBlob } = stubConversion({ drawImage: vi.fn() });

    const response = await optimize({ ...png(), quality: 0.5 });

    expect(response).toMatchObject({ ok: true, payload: { mimeType: "image/webp" } });
    if (!response.ok || response.type !== "optimize-image") throw new Error("unexpected");
    expect(new TextDecoder().decode(response.payload.buffer)).toBe("converted");
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.5 });
    expect(close).toHaveBeenCalledOnce();
  });

  it("defaults the quality to 0.82", async () => {
    const { convertToBlob } = stubConversion({ drawImage: vi.fn() });

    await optimize(png());

    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.82 });
  });

  it("returns the original when there is no 2d context, and still releases the bitmap", async () => {
    const { close } = stubConversion(null);

    const response = await optimize(png());

    expect(response).toMatchObject({ ok: true, payload: { mimeType: "image/png" } });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("errors", () => {
  it("reports a failure with the error's message", async () => {
    vi.stubGlobal("OffscreenCanvas", class {});
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode failed")));

    const response = await optimize({ buffer: bytes("x"), mimeType: "image/png" });

    expect(response).toMatchObject({ ok: false, error: "decode failed" });
  });

  it("reports a generic message for a non-Error failure", async () => {
    vi.stubGlobal("OffscreenCanvas", class {});
    // Deliberately not an Error: this is the case the worker's generic message covers.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    vi.stubGlobal("createImageBitmap", () => Promise.reject("boom"));

    const response = await optimize({ buffer: bytes("x"), mimeType: "image/png" });

    expect(response).toMatchObject({ ok: false, error: "Unknown worker error" });
  });
});
