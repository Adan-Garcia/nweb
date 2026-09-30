import { describe, expect, it } from "vitest";

import { diffElements, EMPTY_HISTORY, type History, recordStep, redo, undo } from "./history";
import type { SceneElement, Stroke } from "./scene-model";

function stroke(id: string, version = 1, color: Stroke["color"] = "ink-black"): Stroke {
  return {
    id,
    version,
    index: "a0",
    type: "stroke",
    tool: "pen",
    color,
    width: 2,
    x: 0,
    y: 0,
    samples: [0, 0, 0.5, 0, 0, 0],
  };
}

function byId(elements: readonly SceneElement[] | undefined) {
  return new Map((elements ?? []).map((element) => [element.id, element]));
}

describe("diffElements", () => {
  it("records additions, deletions and changes, and nothing for what stayed", () => {
    const step = diffElements(
      [stroke("same"), stroke("changed"), stroke("gone")],
      [stroke("same"), stroke("changed", 2), stroke("new")],
    );

    expect(
      step.changes.map(({ id, before, after }) => [id, before?.version, after?.version]),
    ).toEqual([
      ["changed", 1, 2],
      ["gone", 1, undefined],
      ["new", undefined, 1],
    ]);
  });
});

describe("recordStep", () => {
  it("keeps the last steps up to the limit and forgets redo", () => {
    let history: History = { undo: [], redo: [{ changes: [] }] };
    for (let i = 0; i < 5; i += 1) {
      history = recordStep(history, diffElements([], [stroke(`s${i}`)]), 3);
    }

    expect(history.undo.map((step) => step.changes[0].id)).toEqual(["s2", "s3", "s4"]);
    expect(history.redo).toEqual([]);
  });

  it("ignores a step that changed nothing", () => {
    expect(recordStep(EMPTY_HISTORY, { changes: [] })).toBe(EMPTY_HISTORY);
  });
});

describe("undo and redo", () => {
  it("undoes a new stroke, then redoes it", () => {
    const before: SceneElement[] = [];
    const after = [stroke("s")];
    const history = recordStep(EMPTY_HISTORY, diffElements(before, after));

    const undone = undo(history, after);
    expect(undone?.elements).toEqual([]);

    const redone = undone && redo(undone.history, undone.elements);
    expect(redone?.elements.map((element) => element.id)).toEqual(["s"]);
    expect(redone?.history.redo).toEqual([]);
    expect(redone?.history.undo).toHaveLength(1);
  });

  it("restores an edited element at a version above both sides", () => {
    const before = [stroke("s", 3, "ink-black")];
    const after = [stroke("s", 4, "ink-red")];
    const history = recordStep(EMPTY_HISTORY, diffElements(before, after));

    const undone = undo(history, after);
    const restored = byId(undone?.elements).get("s");
    expect(restored).toMatchObject({ color: "ink-black", version: 5 });

    const redone = undone && redo(undone.history, undone.elements);
    expect(byId(redone?.elements).get("s")).toMatchObject({ color: "ink-red", version: 6 });
  });

  it("brings back something erased", () => {
    const before = [stroke("s", 2)];
    const history = recordStep(EMPTY_HISTORY, diffElements(before, []));

    expect(undo(history, [])?.elements).toEqual([{ ...before[0], version: 3 }]);
  });

  it("leaves alone an element changed since, and undoes the rest of the step", () => {
    const before = [stroke("a", 1), stroke("b", 1)];
    const after = [stroke("a", 2, "ink-red"), stroke("b", 2, "ink-red")];
    const history = recordStep(EMPTY_HISTORY, diffElements(before, after));
    // Another device recoloured "b" again after this device's step.
    const now = [after[0], stroke("b", 3, "ink-green")];

    const undone = undo(history, now);
    expect(byId(undone?.elements).get("a")).toMatchObject({ color: "ink-black" });
    expect(byId(undone?.elements).get("b")).toMatchObject({ color: "ink-green", version: 3 });
    expect(undone?.history.redo[0].changes.map((change) => change.id)).toEqual(["a"]);
  });

  it("skips steps that were overtaken entirely, and says so when nothing is left", () => {
    let history = recordStep(EMPTY_HISTORY, diffElements([], [stroke("old")]));
    history = recordStep(history, diffElements([], [stroke("new")]));
    // "new" was deleted elsewhere; "old" is still as this device left it.
    const undone = undo(history, [stroke("old")]);

    expect(undone?.elements).toEqual([]);
    expect(undone?.history.undo).toEqual([]);
    expect(undone && undo(undone.history, undone.elements)).toBeNull();
    expect(redo(EMPTY_HISTORY, [])).toBeNull();
  });
});
