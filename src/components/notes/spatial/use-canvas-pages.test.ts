import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createPage, type Scene } from "@/lib/canvas/scene-model";

import { useCanvasPages } from "./use-canvas-pages";

function setup(scene: Scene) {
  const commit = vi.fn();
  const setCamera = vi.fn();
  const hook = renderHook(() =>
    useCanvasPages(
      {
        scene,
        liveRef: {
          current: { scene, files: new Map(), history: { undo: [], redo: [] }, revision: 0 },
        },
        commit,
      },
      { camera: { x: 0, y: -5000, zoom: 1 }, viewport: { width: 800, height: 600 }, setCamera },
    ),
  );

  return { ...hook, commit, setCamera };
}

describe("useCanvasPages", () => {
  it("takes the first page as the one in view when the view is off every page", () => {
    const { result } = setup({ format: 1, layout: "paged", elements: [createPage("a0", "p1")] });

    expect(result.current.currentId).toBe("p1");
  });

  it("has no page in view on a note with none, and adds one at the end", () => {
    const { result, commit, setCamera } = setup({ format: 1, layout: "paged", elements: [] });
    expect(result.current.currentId).toBeNull();

    act(() => result.current.add());

    expect(commit.mock.calls[0][0]).toHaveLength(1);
    expect(setCamera).toHaveBeenCalled();
  });

  it("neither moves a page nowhere nor deletes the last one", () => {
    const { result, commit } = setup({
      format: 1,
      layout: "paged",
      elements: [createPage("a0", "p1")],
    });

    act(() => result.current.move("p1", 0));
    act(() => result.current.remove("p1"));

    expect(commit).not.toHaveBeenCalled();
  });
});
