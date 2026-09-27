import { afterEach, describe, expect, it, vi } from "vitest";

import { convertImageBlobToWebp, renameToWebp } from "./image-utils";

const png = () => new Blob(["png-bytes"], { type: "image/png" });

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob");

// jsdom has no canvas; replace the two methods the converter uses (no type casts needed).
function stubCanvas({
  context,
  blob,
}: {
  context: { drawImage: () => void } | null;
  blob: Blob | null;
}) {
  const toBlob = vi.fn((callback: BlobCallback) => callback(blob));
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: toBlob,
  });
  return toBlob;
}

describe("renameToWebp", () => {
  it("swaps the extension", () => {
    expect(renameToWebp("photo.png")).toBe("photo.webp");
    expect(renameToWebp("archive.tar.gz")).toBe("archive.tar.webp");
  });

  it("appends when there is no usable extension", () => {
    expect(renameToWebp("photo")).toBe("photo.webp");
    expect(renameToWebp(".hidden")).toBe(".hidden.webp");
  });
});

describe("convertImageBlobToWebp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalGetContext)
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
    if (originalToBlob)
      Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", originalToBlob);
  });

  it("returns non-images and existing webp untouched", async () => {
    const text = new Blob(["hi"], { type: "text/plain" });
    const webp = new Blob(["w"], { type: "image/webp" });
    expect(await convertImageBlobToWebp(text, 0.8)).toBe(text);
    expect(await convertImageBlobToWebp(webp, 0.8)).toBe(webp);
  });

  it("returns the original when the browser cannot decode bitmaps", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const blob = png();
    expect(await convertImageBlobToWebp(blob, 0.8)).toBe(blob);
  });

  it("returns the original when there is no 2d canvas context, and still releases the bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4, height: 2, close }));
    stubCanvas({ context: null, blob: null });
    const blob = png();

    expect(await convertImageBlobToWebp(blob, 0.8)).toBe(blob);
    expect(close).toHaveBeenCalledOnce();
  });

  it("draws to a canvas and returns the webp result at the requested quality", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const webp = new Blob(["converted"], { type: "image/webp" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4, height: 2, close }));
    const toBlob = stubCanvas({ context: { drawImage }, blob: webp });

    const result = await convertImageBlobToWebp(png(), 0.5);

    expect(result).toBe(webp);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.5);
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to the original when the canvas cannot produce a blob", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }),
    );
    stubCanvas({ context: { drawImage: vi.fn() }, blob: null });
    const blob = png();

    expect(await convertImageBlobToWebp(blob, 0.8)).toBe(blob);
  });
});
