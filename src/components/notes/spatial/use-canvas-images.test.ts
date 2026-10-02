import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasFile } from "@/lib/canvas/canvas-files";

import { useCanvasImages } from "./use-canvas-images";

const created: FakeImage[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  src = "";
  constructor() {
    created.push(this);
  }
}

const file = (id: string): CanvasFile => ({
  id,
  mimeType: "image/png",
  created: 1,
  url: `blob:${id}`,
});

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe("useCanvasImages", () => {
  it("decodes each file once and hands it over once it has loaded", async () => {
    const files = new Map([["a", file("a")]]);
    const { result, rerender } = renderHook(({ current }) => useCanvasImages(current), {
      initialProps: { current: files },
    });
    expect(result.current.size).toBe(0);
    expect(created[0].src).toBe("blob:a");

    act(() => created[0].onload?.());
    await waitFor(() => expect(result.current.get("a")).toBe(created[0]));

    rerender({ current: new Map([...files, ["b", file("b")]]) });
    expect(created.map((image) => image.src)).toEqual(["blob:a", "blob:b"]);
  });

  it("ignores an image that loads after the canvas has gone", () => {
    const { result, unmount } = renderHook(() => useCanvasImages(new Map([["a", file("a")]])));
    unmount();

    act(() => created[0].onload?.());
    expect(result.current.size).toBe(0);
  });
});
