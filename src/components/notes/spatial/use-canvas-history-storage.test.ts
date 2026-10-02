import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_HISTORY, type History } from "@/lib/canvas/history";
import { readCanvasHistory, saveCanvasHistory } from "@/lib/canvas/history-storage";
import type { Stroke } from "@/lib/canvas/scene-model";
import { getNotesDb } from "@/lib/db/notes-db";

import { useCanvasHistoryStorage } from "./use-canvas-history-storage";

const stroke: Stroke = {
  id: "ink",
  version: 1,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0],
};
const step = (id: string) => ({ changes: [{ id, before: null, after: { ...stroke, id } }] });

function setup(documentId: string | null, isReadOnly = false) {
  const adoptHistory = vi.fn<(saved: History) => void>();
  const hook = renderHook(
    ({ history }: { history: History }) =>
      useCanvasHistoryStorage(documentId, { history, adoptHistory }, isReadOnly),
    { initialProps: { history: EMPTY_HISTORY } },
  );

  return { ...hook, adoptHistory };
}

beforeEach(async () => {
  await (await getNotesDb()).clear("canvas-history");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCanvasHistoryStorage", () => {
  it("hands over the note's saved history when it opens", async () => {
    const saved = { undo: [step("a")], redo: [] };
    await saveCanvasHistory("note", saved);
    const { adoptHistory } = setup("note");

    await waitFor(() => expect(adoptHistory).toHaveBeenCalledWith(saved));
  });

  it("writes the history a moment after it changes, and what is pending when it closes", async () => {
    const { adoptHistory, rerender, unmount } = setup("note");
    await waitFor(() => expect(adoptHistory).toHaveBeenCalled());

    vi.useFakeTimers();
    rerender({ history: { undo: [step("a")], redo: [] } });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    vi.useRealTimers();
    expect((await readCanvasHistory("note")).undo).toHaveLength(1);

    rerender({ history: { undo: [step("a"), step("b")], redo: [] } });
    unmount();
    await waitFor(async () => expect((await readCanvasHistory("note")).undo).toHaveLength(2));
  });

  it("writes nothing before the saved history has been read", async () => {
    await saveCanvasHistory("note", { undo: [step("kept")], redo: [] });
    const { rerender, unmount } = setup("note");

    rerender({ history: EMPTY_HISTORY });
    unmount();

    expect((await readCanvasHistory("note")).undo).toHaveLength(1);
  });

  it("keeps nothing for a note shared to read, or with no id", async () => {
    const readOnly = setup("note", true);
    const none = setup(null);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(readOnly.adoptHistory).not.toHaveBeenCalled();
    expect(none.adoptHistory).not.toHaveBeenCalled();
  });

  it("lets a history that cannot be written go", async () => {
    const { adoptHistory, rerender, unmount } = setup("note");
    await waitFor(() => expect(adoptHistory).toHaveBeenCalled());
    const database = await getNotesDb();
    const put = vi.spyOn(database, "put").mockRejectedValue(new Error("locked"));

    rerender({ history: { undo: [step("a")], redo: [] } });
    unmount();

    await waitFor(() => expect(put).toHaveBeenCalled());
  });
});
