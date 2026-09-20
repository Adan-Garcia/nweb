import { describe, expect, it, vi } from "vitest";

import { createPngSceneFile, newSceneFileId } from "./excalidraw-adapter";
import { collectReferencedFileIds, convertSceneFilesForStorage, isImageFile } from "./scene-utils";
import type { SceneFiles } from "./types";

// Only `fileId` matters to these helpers.
const elementsWith = (...fileIds: (string | null | undefined)[]) =>
  fileIds.map((fileId) => ({ type: "image", fileId }));

describe("isImageFile", () => {
  it("recognises image mime types", () => {
    expect(isImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File([""], "a.pdf", { type: "application/pdf" }))).toBe(false);
    expect(isImageFile(new File([""], "a"))).toBe(false);
  });
});

describe("collectReferencedFileIds", () => {
  it("collects the distinct, non-empty file ids used by elements", () => {
    const ids = collectReferencedFileIds(elementsWith("a", "b", "a", "", null, undefined));
    expect([...ids]).toEqual(["a", "b"]);
  });

  it("ignores elements that have no file id at all", () => {
    const ids = collectReferencedFileIds([{ type: "rectangle" }]);
    expect(ids.size).toBe(0);
  });
});

describe("convertSceneFilesForStorage", () => {
  // `text/plain` data URLs keep these tests free of image decoding.
  const textUrl = (text: string, mime = "text/plain") => `data:${mime};base64,${btoa(text)}`;

  function scene(entries: Record<string, string>): SceneFiles {
    const files: SceneFiles = {};
    for (const [id, dataUrl] of Object.entries(entries)) {
      files[id] = createPngSceneFile(newSceneFileId(), dataUrl, 100);
    }
    return files;
  }

  it("persists only the files the scene still references", async () => {
    const files = scene({ keep: textUrl("kept"), drop: textUrl("dropped") });

    const persisted = await convertSceneFilesForStorage({
      files,
      referencedFileIds: new Set(["keep"]),
      optimizeImageBlob: (blob) => Promise.resolve(blob),
    });

    expect(persisted.map((file) => file.id)).toEqual(["keep"]);
    expect(persisted[0]).toMatchObject({ mimeType: "text/plain", created: 100 });
    expect(await persisted[0].blob.text()).toBe("kept");
  });

  it("does not try to optimize files that are not images", async () => {
    const optimizeImageBlob = vi.fn((blob: Blob) => Promise.resolve(blob));

    await convertSceneFilesForStorage({
      files: scene({ a: textUrl("x") }),
      referencedFileIds: new Set(["a"]),
      optimizeImageBlob,
    });

    expect(optimizeImageBlob).not.toHaveBeenCalled();
  });

  it("optimizes images and stores the optimized blob with its own mime type", async () => {
    const optimized = new Blob(["webp"], { type: "image/webp" });
    const optimizeImageBlob = vi.fn(() => Promise.resolve(optimized));

    const [file] = await convertSceneFilesForStorage({
      files: scene({ img: textUrl("png-bytes", "image/png") }),
      referencedFileIds: new Set(["img"]),
      optimizeImageBlob,
    });

    expect(optimizeImageBlob).toHaveBeenCalledOnce();
    expect(file.blob).toBe(optimized);
    expect(file.mimeType).toBe("image/webp");
  });

  it("keeps the original image if optimization fails", async () => {
    const [file] = await convertSceneFilesForStorage({
      files: scene({ img: textUrl("png-bytes", "image/png") }),
      referencedFileIds: new Set(["img"]),
      optimizeImageBlob: () => Promise.reject(new Error("no codec")),
    });

    expect(file.mimeType).toBe("image/png");
    expect(await file.blob.text()).toBe("png-bytes");
  });

  it("skips a file whose data cannot be read, and keeps the rest", async () => {
    const files = scene({ bad: "not a data url", good: textUrl("ok") });

    const persisted = await convertSceneFilesForStorage({
      files,
      referencedFileIds: new Set(["bad", "good"]),
      optimizeImageBlob: (blob) => Promise.resolve(blob),
    });

    expect(persisted.map((file) => file.id)).toEqual(["good"]);
  });
});
