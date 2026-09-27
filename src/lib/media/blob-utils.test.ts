import { describe, expect, it, vi } from "vitest";

import { blobToDataUrl, revokeObjectUrls } from "./blob-utils";

describe("blobToDataUrl", () => {
  it("encodes a blob as a data URL with its mime type", async () => {
    const dataUrl = await blobToDataUrl(new Blob(["hello"], { type: "text/plain" }));
    expect(dataUrl).toBe("data:text/plain;base64,aGVsbG8=");
  });

  it("rejects when the reader fails", async () => {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
    await expect(blobToDataUrl(new Blob(["x"]))).rejects.toThrow("Failed to read blob as data URL");
  });

  it("rejects when the reader yields a non-string result", async () => {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    });
    await expect(blobToDataUrl(new Blob(["x"]))).rejects.toThrow("Failed to read blob as data URL");
  });
});

describe("revokeObjectUrls", () => {
  it("revokes every url it is given", () => {
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    revokeObjectUrls(["blob:a", "blob:b"]);
    expect(revoke.mock.calls).toEqual([["blob:a"], ["blob:b"]]);
  });

  it("does nothing for an empty list", () => {
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    revokeObjectUrls([]);
    expect(revoke).not.toHaveBeenCalled();
  });
});
