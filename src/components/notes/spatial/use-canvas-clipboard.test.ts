import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getClipboard, setClipboard } from "@/lib/canvas/canvas-clipboard";
import type { CanvasFile } from "@/lib/canvas/canvas-files";
import {
  createPage,
  createScene,
  type ImageElement,
  type Scene,
  type Stroke,
} from "@/lib/canvas/scene-model";
import { stubCanvasDrawing } from "@/test/canvas-context";

import { useCanvasCamera } from "./use-canvas-camera";
import { useCanvasClipboard } from "./use-canvas-clipboard";
import { useCanvasScene } from "./use-canvas-scene";

const stroke: Stroke = {
  id: "ink",
  version: 1,
  index: "a1",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0, 100, 0, 0.5, 0, 0, 8],
};
const photo: ImageElement = {
  id: "photo",
  version: 1,
  index: "a2",
  type: "image",
  fileId: "file-1",
  x: 0,
  y: 50,
  width: 40,
  height: 30,
};
const photoFile: CanvasFile = {
  id: "file-1",
  mimeType: "text/plain",
  created: 1,
  url: "data:text/plain;base64,aGVsbG8=",
};

function setup(scene: Scene, { files = new Map<string, CanvasFile>(), isReadOnly = false } = {}) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => DOMRect.fromRect({ width: 400, height: 300 });
  const onPasted = vi.fn();
  const hook = renderHook(() => {
    const sceneState = useCanvasScene({ scene, files }, vi.fn());
    const camera = useCanvasCamera({ current: host }, null);
    const clipboard = useCanvasClipboard({
      hostRef: { current: host },
      sceneState,
      camera,
      images: new Map(),
      isReadOnly,
      onPasted,
    });

    return { sceneState, clipboard };
  });
  const paste = (data: { text?: string; files?: File[] } = {}) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.assign(event, {
      clipboardData: { getData: () => data.text ?? "", files: data.files ?? [] },
    });
    act(() => {
      host.dispatchEvent(event);
    });

    return event;
  };

  return { ...hook, host, onPasted, paste };
}

/** jsdom has neither; an item here is the object of types it was made from. */
function stubSystemClipboard(write: (items: never) => Promise<unknown>) {
  Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
  Object.defineProperty(globalThis, "ClipboardItem", {
    value: class {
      constructor(items: Record<string, Promise<Blob> | Blob>) {
        return items;
      }
    },
    configurable: true,
  });
}

afterEach(() => {
  setClipboard(null);
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(globalThis, "ClipboardItem");
});

const withBoth = { ...createScene("infinite"), elements: [stroke, photo] };

describe("useCanvasClipboard", () => {
  it("copies nothing without a selection", async () => {
    const { result } = setup(withBoth);

    expect(result.current.clipboard.canCopy).toBe(false);
    await act(() => result.current.clipboard.copy());
    expect(getClipboard()).toBeNull();
  });

  it("copies the selection with its images' bytes, and pastes it selected in the view", async () => {
    const { result, onPasted } = setup(withBoth, { files: new Map([["file-1", photoFile]]) });
    act(() => result.current.sceneState.setSelection(new Set(["ink", "photo"])));

    await act(() => result.current.clipboard.copy());
    expect(result.current.clipboard.canPaste).toBe(true);
    expect(await getClipboard()?.files[0].blob?.text()).toBe("hello");

    act(() => result.current.clipboard.paste());
    const elements = result.current.sceneState.scene.elements;
    const pasted = elements.slice(2);
    expect(pasted.map((element) => element.type)).toEqual(["stroke", "image"]);
    expect(pasted.every((element) => element.index > "a2")).toBe(true);
    expect(result.current.sceneState.selection).toEqual(new Set(pasted.map(({ id }) => id)));
    expect(onPasted).toHaveBeenCalled();
  });

  it("brings the images along into another note", async () => {
    const source = setup(withBoth, { files: new Map([["file-1", photoFile]]) });
    act(() => source.result.current.sceneState.setSelection(new Set(["photo"])));
    await act(() => source.result.current.clipboard.copy());

    const target = setup(createScene("infinite"));
    target.paste();

    expect(target.result.current.sceneState.files.get("file-1")?.blob).toBeDefined();
    expect(target.result.current.sceneState.scene.elements).toHaveLength(1);
  });

  it("drops an image whose bytes are gone, and leaves out a file it cannot find", async () => {
    const lost = { ...photoFile, url: "blob:http://localhost/gone" };
    const { result } = setup(withBoth, { files: new Map([["file-1", lost]]) });
    act(() => result.current.sceneState.setSelection(new Set(["photo"])));
    await act(() => result.current.clipboard.copy());
    expect(getClipboard()?.files).toEqual([]);

    const bare = setup(withBoth);
    act(() => bare.result.current.sceneState.setSelection(new Set(["photo"])));
    await act(() => bare.result.current.clipboard.copy());
    expect(getClipboard()?.files).toEqual([]);
  });

  it("pastes onto the page in view of a paged note", async () => {
    const source = setup(withBoth);
    act(() => source.result.current.sceneState.setSelection(new Set(["ink"])));
    await act(() => source.result.current.clipboard.copy());

    const target = setup({ format: 1, layout: "paged", elements: [createPage("a0", "page")] });
    act(() => target.result.current.clipboard.paste());

    expect(target.result.current.sceneState.scene.elements[1]).toMatchObject({ pageId: "page" });
  });

  it("puts a PNG and its marker on the system clipboard", async () => {
    stubCanvasDrawing();
    const write = vi.fn((items: Array<Record<string, Promise<Blob> | Blob>>) =>
      Promise.all(Object.values(items[0]).map((value) => Promise.resolve(value))),
    );
    stubSystemClipboard(write);
    const { result } = setup(withBoth);
    act(() => result.current.sceneState.setSelection(new Set(["ink"])));

    await act(() => result.current.clipboard.copy());

    const [items] = write.mock.calls[0];
    expect((await items[0]["image/png"]).type).toBe("image/png");
    expect(await (await items[0]["text/plain"]).text()).toBe(
      `cuervo-canvas:${getClipboard()?.marker}`,
    );
  });

  it("fails the PNG, not the copy, when the selection cannot be drawn", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(null),
    );
    const write = vi.fn((items: Array<Record<string, Promise<Blob>>>) => items[0]["image/png"]);
    stubSystemClipboard(write);
    const { result } = setup(withBoth);
    act(() => result.current.sceneState.setSelection(new Set(["ink"])));

    await act(() => result.current.clipboard.copy());

    expect(getClipboard()).not.toBeNull();
  });

  it("claims a paste of its own copy, and leaves another app's picture to the image paste", async () => {
    const { result, paste } = setup(withBoth);
    act(() => result.current.sceneState.setSelection(new Set(["ink"])));
    await act(() => result.current.clipboard.copy());
    const picture = new File(["x"], "x.png", { type: "image/png" });

    expect(paste({ files: [picture], text: "something else" }).defaultPrevented).toBe(false);
    expect(result.current.sceneState.scene.elements).toHaveLength(2);

    const marker = `cuervo-canvas:${getClipboard()?.marker}`;
    expect(paste({ files: [picture], text: marker }).defaultPrevented).toBe(true);
    expect(result.current.sceneState.scene.elements).toHaveLength(3);
  });

  it("leaves a paste alone with nothing copied", () => {
    const { paste } = setup(withBoth);

    expect(paste().defaultPrevented).toBe(false);
  });

  it("deletes the selection, and nothing without one", () => {
    const { result } = setup(withBoth);
    act(() => result.current.clipboard.remove());
    expect(result.current.sceneState.scene.elements).toHaveLength(2);

    act(() => result.current.sceneState.setSelection(new Set(["ink"])));
    act(() => result.current.clipboard.remove());
    expect(result.current.sceneState.scene.elements.map(({ id }) => id)).toEqual(["photo"]);
    expect(result.current.sceneState.selection.size).toBe(0);
  });

  it("neither pastes nor deletes on a note shared to read", () => {
    setClipboard({
      content: { elements: [stroke], fileIds: [], size: { width: 1, height: 1 } },
      files: [],
      marker: "m",
    });
    const { result, paste } = setup(withBoth, { isReadOnly: true });

    act(() => result.current.clipboard.paste());
    expect(paste().defaultPrevented).toBe(false);
    act(() => result.current.sceneState.setSelection(new Set(["ink"])));
    act(() => result.current.clipboard.remove());

    expect(result.current.sceneState.scene.elements).toHaveLength(2);
  });
});
