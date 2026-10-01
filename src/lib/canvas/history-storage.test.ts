import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { EMPTY_HISTORY, type History } from "./history";
import { deleteCanvasHistory, readCanvasHistory, saveCanvasHistory } from "./history-storage";
import type { Stroke } from "./scene-model";

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
  samples: [0, 0, 0.5, 0, 0, 0],
};

const history: History = {
  undo: [{ changes: [{ id: "ink", before: null, after: stroke }] }],
  redo: [],
};

beforeEach(async () => {
  await (await getNotesDb()).clear("canvas-history");
});

afterEach(() => resetActiveCipher());

describe("canvas history storage", () => {
  it("keeps a note's history and reads it back", async () => {
    await saveCanvasHistory("note", history);

    expect(await readCanvasHistory("note")).toEqual(history);
    expect(await readCanvasHistory("other")).toEqual(EMPTY_HISTORY);
  });

  it("seals the steps with the lock, and forgets a history no key opens", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    setActiveCipher(createAesGcmCipher(key, "key-1"));
    await saveCanvasHistory("note", history);

    const stored = await (await getNotesDb()).get("canvas-history", "note");
    expect(stored?.encryption).toBe("aes-gcm");
    expect(stored?.steps).not.toContain("ink");
    expect(await readCanvasHistory("note")).toEqual(history);

    resetActiveCipher();
    expect(await readCanvasHistory("note")).toEqual(EMPTY_HISTORY);
  });

  it("forgets a history that does not parse", async () => {
    const database = await getNotesDb();
    await database.put("canvas-history", { id: "bad", updatedAt: 1, steps: "{" });
    await database.put("canvas-history", { id: "wrong", updatedAt: 1, steps: '{"undo":1}' });

    expect(await readCanvasHistory("bad")).toEqual(EMPTY_HISTORY);
    expect(await readCanvasHistory("wrong")).toEqual(EMPTY_HISTORY);
  });

  it("keeps nothing for an empty history, and deletes on request", async () => {
    await saveCanvasHistory("note", history);
    await saveCanvasHistory("note", EMPTY_HISTORY);
    expect(await (await getNotesDb()).get("canvas-history", "note")).toBeUndefined();

    await saveCanvasHistory("note", history);
    await deleteCanvasHistory("note");
    expect(await readCanvasHistory("note")).toEqual(EMPTY_HISTORY);
  });
});
