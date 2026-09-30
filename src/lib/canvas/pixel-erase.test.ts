import { describe, expect, it } from "vitest";

import { cutStroke, piecesToStrokes } from "./pixel-erase";
import type { Stroke } from "./scene-model";
import { decodeSamples } from "./stroke-geometry";

/** A line from (10, 10) to (110, 10) with a sample every 10 units. */
const stroke: Stroke = {
  id: "s",
  version: 4,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-blue",
  width: 2,
  x: 10,
  y: 10,
  samples: Array.from({ length: 11 }, (_, i) => [i * 10, 0, 0.5, 0, 0, i ? 8 : 0]).flat(),
};

describe("cutStroke", () => {
  it("leaves a stroke the eraser missed alone", () => {
    expect(cutStroke(stroke, [{ x: 50, y: 40 }], 3)).toBeNull();
  });

  it("cuts a stroke in two where the eraser crossed it", () => {
    const pieces = cutStroke(
      stroke,
      [
        { x: 60, y: 0 },
        { x: 60, y: 20 },
      ],
      3,
    );

    expect(pieces).toHaveLength(2);
    const [left, right] = pieces ?? [];
    expect(left.x).toBe(10);
    const leftEnd = decodeSamples(left.samples).at(-1);
    expect(left.x + (leftEnd?.x ?? 0)).toBeLessThan(56);
    expect(right.x).toBeGreaterThan(64);
  });

  it("cuts a fast stroke between two far-apart samples", () => {
    const sparse = { ...stroke, samples: [0, 0, 0.5, 0, 0, 0, 100, 0, 0.5, 0, 0, 8] };
    const pieces = cutStroke(sparse, [{ x: 60, y: 10 }], 2);

    expect(pieces).toHaveLength(2);
    expect(pieces?.[1].samples[2]).toBe(0.5);
  });

  it("erases a stroke whole, dropping leftovers of a single sample", () => {
    const short = { ...stroke, samples: [0, 0, 0.5, 0, 0, 0, 4, 0, 0.5, 0, 0, 8] };

    expect(cutStroke(short, [{ x: 12, y: 10 }], 3)).toEqual([]);
  });
});

describe("piecesToStrokes", () => {
  it("gives the pieces new ids and keys at the original's depth", () => {
    const ids = ["n1", "n2"];
    const strokes = piecesToStrokes(
      stroke,
      [
        { x: 1, y: 2, samples: [0, 0, 0.5, 0, 0, 0] },
        { x: 3, y: 4, samples: [0, 0, 0.5, 0, 0, 0] },
      ],
      "a1",
      () => ids.shift() ?? "",
    );

    expect(strokes.map(({ id, version, x, color }) => ({ id, version, x, color }))).toEqual([
      { id: "n1", version: 1, x: 1, color: "ink-blue" },
      { id: "n2", version: 1, x: 3, color: "ink-blue" },
    ]);
    expect(strokes.every(({ index }) => index > "a0" && index < "a1")).toBe(true);
    expect(strokes[0].index < strokes[1].index).toBe(true);
  });

  it("makes up random ids by default", () => {
    const [piece] = piecesToStrokes(stroke, [{ x: 0, y: 0, samples: stroke.samples }], null);

    expect(piece.id).not.toBe("s");
  });
});
