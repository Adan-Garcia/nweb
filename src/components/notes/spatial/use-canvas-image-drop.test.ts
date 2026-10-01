import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScene, type SceneLayout } from "@/lib/canvas/scene-model";

import { useCanvasCamera } from "./use-canvas-camera";
import { useCanvasImageDrop } from "./use-canvas-image-drop";
import { useCanvasScene } from "./use-canvas-scene";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 200;
  naturalHeight = 100;
  set src(url: string) {
    queueMicrotask(() => (url.includes("broken") ? this.onerror?.() : this.onload?.()));
  }
}

let urls = 0;
const revoke = vi.fn();

beforeEach(() => {
  urls = 0;
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", { createObjectURL: () => `blob:${(urls += 1)}`, revokeObjectURL: revoke });
});
afterEach(() => vi.unstubAllGlobals());

function setup({
  isReadOnly = false,
  layout = "infinite" as SceneLayout,
  broken = false,
  untyped = false,
} = {}) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => DOMRect.fromRect({ width: 400, height: 300 });
  const optimizeImage = vi.fn((file: File) =>
    Promise.resolve(
      new Blob([file.name], { type: untyped ? "" : broken ? "image/broken" : "image/webp" }),
    ),
  );
  if (broken) {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:broken", revokeObjectURL: revoke });
  }
  const hook = renderHook(() => {
    const sceneState = useCanvasScene({ scene: createScene(layout), files: new Map() }, vi.fn());
    const camera = useCanvasCamera({ current: host }, null);
    useCanvasImageDrop({
      hostRef: { current: host },
      sceneState,
      camera,
      optimizeImage,
      isReadOnly,
    });
    return sceneState;
  });

  return { host, optimizeImage, ...hook };
}

function withFiles<T extends Event>(
  event: T,
  key: "dataTransfer" | "clipboardData",
  files: File[],
): T {
  Object.defineProperty(event, key, { value: { files, types: ["Files"] } });
  return event;
}

const picture = () => new File(["pixels"], "photo.png", { type: "image/png" });

describe("useCanvasImageDrop", () => {
  it("places a dropped image where it lands, made smaller and named by its bytes", async () => {
    const { host, optimizeImage, result } = setup();
    const over = withFiles(new Event("dragover", { cancelable: true }), "dataTransfer", []);
    host.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);

    const drop = withFiles(
      new MouseEvent("drop", { cancelable: true, clientX: 200, clientY: 150 }),
      "dataTransfer",
      [picture(), new File(["text"], "notes.txt", { type: "text/plain" })],
    );
    act(() => {
      host.dispatchEvent(drop);
    });

    await waitFor(() => expect(result.current.scene.elements).toHaveLength(1));
    expect(drop.defaultPrevented).toBe(true);
    expect(optimizeImage).toHaveBeenCalledOnce();
    const [image] = result.current.scene.elements;
    expect(image).toMatchObject({ type: "image", width: 200, height: 100, x: -100, y: -50 });
    expect(image.type === "image" && result.current.files.get(image.fileId)).toMatchObject({
      mimeType: "image/webp",
      url: "blob:1",
    });
  });

  it("pastes an image into the middle of the view, onto the page there in a paged note", async () => {
    const { host, result } = setup({ layout: "paged" });

    act(() => {
      host.dispatchEvent(
        withFiles(new Event("paste", { cancelable: true }), "clipboardData", [picture()]),
      );
    });

    await waitFor(() => expect(result.current.scene.elements).toHaveLength(2));
    const [, image] = result.current.scene.elements;
    expect(image.type).toBe("image");
    expect(image.type === "image" && image.pageId).toEqual(expect.any(String));
  });

  it("ignores a drag or paste with no files, and an image that will not decode", async () => {
    const { host, result, optimizeImage } = setup({ broken: true });

    const over = new Event("dragover", { cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: { files: [], types: ["text/plain"] } });
    host.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    host.dispatchEvent(withFiles(new Event("drop"), "dataTransfer", []));
    host.dispatchEvent(withFiles(new Event("paste"), "clipboardData", []));
    host.dispatchEvent(new Event("drop"));
    host.dispatchEvent(new Event("paste"));

    act(() => {
      host.dispatchEvent(withFiles(new Event("paste"), "clipboardData", [picture()]));
    });
    await waitFor(() => expect(optimizeImage).toHaveBeenCalledOnce());
    expect(result.current.scene.elements).toHaveLength(0);
  });

  it("keeps the file's own type when the smaller copy has none", async () => {
    const { host, result } = setup({ untyped: true });

    act(() => {
      host.dispatchEvent(withFiles(new Event("paste"), "clipboardData", [picture()]));
    });

    await waitFor(() => expect(result.current.files.size).toBe(1));
    expect([...result.current.files.values()][0].mimeType).toBe("image/png");
  });

  it("takes nothing on a note shared to read, and frees its URLs when it goes", async () => {
    const readOnly = setup({ isReadOnly: true });
    readOnly.host.dispatchEvent(withFiles(new Event("paste"), "clipboardData", [picture()]));
    expect(readOnly.optimizeImage).not.toHaveBeenCalled();

    const { host, result, unmount } = setup();
    act(() => {
      host.dispatchEvent(withFiles(new Event("paste"), "clipboardData", [picture()]));
    });
    await waitFor(() => expect(result.current.scene.elements).toHaveLength(1));
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });

  it("listens to nothing without a host", () => {
    expect(() =>
      renderHook(() => {
        const sceneState = useCanvasScene(
          { scene: createScene("infinite"), files: new Map() },
          vi.fn(),
        );
        const camera = useCanvasCamera({ current: null }, null);
        useCanvasImageDrop({
          hostRef: { current: null },
          sceneState,
          camera,
          optimizeImage: vi.fn(),
          isReadOnly: false,
        });
      }),
    ).not.toThrow();
  });
});
