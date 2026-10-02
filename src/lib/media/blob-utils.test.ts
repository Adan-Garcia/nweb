import { describe, expect, it, vi } from "vitest";

import { blobToDataUrl, dataUrlToBlob, revokeObjectUrls } from "./blob-utils";

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

describe("dataUrlToBlob", () => {
  it("decodes a base64 data URL back into a blob of its type", async () => {
    const blob = dataUrlToBlob("data:text/plain;base64,aGVsbG8=");

    expect(blob?.type).toBe("text/plain");
    expect(await blob?.text()).toBe("hello");
  });

  it("returns null for anything that is not base64 data", () => {
    expect(dataUrlToBlob("blob:http://localhost/abc")).toBeNull();
    expect(dataUrlToBlob("data:text/plain;base64,***")).toBeNull();
  });
});
