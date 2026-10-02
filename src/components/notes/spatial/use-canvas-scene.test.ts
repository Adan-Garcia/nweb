import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SpatialSnapshot } from "@/components/notes/types";
import { createScene, type Stroke } from "@/lib/canvas/scene-model";

import { useCanvasScene } from "./use-canvas-scene";

const stroke = (id: string, version = 1): Stroke => ({
  id,
  version,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0],
});

function setup() {
  const onChange = vi.fn<(snapshot: SpatialSnapshot) => void>();
  const hook = renderHook(() =>
    useCanvasScene({ scene: createScene("infinite"), files: new Map() }, onChange),
  );
  const ids = () => hook.result.current.scene.elements.map((element) => element.id);

  return { ...hook, onChange, ids };
}

describe("useCanvasScene", () => {
  it("commits a change with its files, saving it and recording it for undo", () => {
    const { result, onChange, ids } = setup();
    const file = { id: "f", mimeType: "image/png", created: 1, url: "blob:f" };

    act(() => result.current.commit([stroke("a")], [file]));

    expect(ids()).toEqual(["a"]);
    expect(result.current.files.get("f")).toBe(file);
    expect(result.current.canUndo).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1 }));
  });

  it("shows a gesture as it goes and saves it once, as one undo step", () => {
    const { result, onChange, ids } = setup();

    act(() => result.current.beginGesture());
    act(() => result.current.updateGesture([stroke("a")]));
    act(() => result.current.updateGesture([stroke("a"), stroke("b")]));
    expect(ids()).toEqual(["a", "b"]);
    expect(onChange).not.toHaveBeenCalled();

    act(() => result.current.endGesture());
    expect(onChange).toHaveBeenCalledOnce();

    act(() => result.current.undo());
    expect(ids()).toEqual([]);
    act(() => result.current.redo());
    expect(ids()).toEqual(["a", "b"]);
    expect(result.current.canRedo).toBe(false);
  });

  it("ends a gesture with the elements it hands over, and saves nothing for no change", () => {
    const { result, onChange, ids } = setup();

    act(() => result.current.beginGesture());
    act(() => result.current.endGesture([stroke("final")]));
    expect(ids()).toEqual(["final"]);

    act(() => result.current.beginGesture());
    act(() => result.current.endGesture());
    act(() => result.current.endGesture());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("abandons a gesture without a trace", () => {
    const { result, onChange, ids } = setup();

    act(() => result.current.beginGesture());
    act(() => result.current.updateGesture([stroke("half")]));
    act(() => result.current.cancelGesture());
    act(() => result.current.cancelGesture());

    expect(ids()).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing on undo or redo with nothing to move", () => {
    const { result, onChange } = setup();

    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(onChange).not.toHaveBeenCalled();
  });

  it("holds a selection", () => {
    const { result } = setup();

    act(() => result.current.setSelection(new Set(["a"])));

    expect(result.current.selection).toEqual(new Set(["a"]));
  });

  it("takes on a saved history under the steps made since the note opened", () => {
    const { result, ids } = setup();
    const saved = {
      undo: [{ changes: [{ id: "old", before: null, after: stroke("old") }] }],
      redo: [{ changes: [{ id: "gone", before: null, after: stroke("gone") }] }],
    };

    act(() => result.current.adoptHistory(saved));
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.commit([stroke("a")]));
    act(() => result.current.adoptHistory(saved));
    expect(result.current.history.undo).toHaveLength(3);
    // A step made since the note opened leaves nothing to redo, as it would have.
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(ids()).toEqual([]);
  });
});
