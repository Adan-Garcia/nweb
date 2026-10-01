import { describe, expect, it } from "vitest";

import {
  decodeSamples,
  densify,
  dropCrowdedSamples,
  encodeSamples,
  type InputSample,
  relaxPath,
  smoothPositions,
  smoothPressure,
  strokeBounds,
  strokeOutline,
} from "./stroke-geometry";

function line(count: number, jitter = 0): InputSample[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 100 + i * 4,
    y: 50 + (i % 2 ? jitter : -jitter),
    pressure: 0.5,
    tiltX: 10,
    tiltY: -5,
    time: 1000 + i * 8,
  }));
}

describe("encodeSamples and decodeSamples", () => {
  it("stores positions relative to the first sample and times as gaps", () => {
    const { origin, samples } = encodeSamples(line(3));

    expect(origin).toEqual({ x: 100, y: 50 });
    expect(samples).toEqual([0, 0, 0.5, 10, -5, 0, 4, 0, 0.5, 10, -5, 8, 8, 0, 0.5, 10, -5, 8]);
    expect(decodeSamples(samples).map(({ x, time }) => [x, time])).toEqual([
      [0, 0],
      [4, 8],
      [8, 16],
    ]);
  });

  it("draws a pointer without a pressure sensor at the pen's base width", () => {
    const flat = (pressure: number) =>
      encodeSamples(line(2).map((sample) => ({ ...sample, pressure }))).samples;

    expect([flat(0)[2], flat(0)[8]]).toEqual([0.5, 0.5]);
    expect(flat(1.4)[2]).toBe(1);
  });

  it("gives a pen's touch-down sample, before the sensor reads, the first real pressure", () => {
    const pressures = [0, 0.3, 0, 0.7];
    const { samples } = encodeSamples(
      line(4).map((sample, i) => ({ ...sample, pressure: pressures[i] })),
    );

    // A reading that drops out mid-stroke keeps the one before it.
    expect(decodeSamples(samples).map((sample) => sample.pressure)).toEqual([0.3, 0.3, 0.3, 0.7]);
  });

  it("never records time running backwards, and has no origin for no samples", () => {
    const { samples } = encodeSamples([
      { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: 10 },
      { x: 1, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: 4 },
    ]);
    expect(samples[11]).toBe(0);
    expect(encodeSamples([])).toEqual({ origin: { x: 0, y: 0 }, samples: [] });
  });
});

describe("smoothing", () => {
  it("leaves the samples alone at strength 0 or when there are too few", () => {
    const samples = decodeSamples(encodeSamples(line(10, 3)).samples);

    expect(smoothPositions(samples, 0)).toEqual(samples);
    expect(smoothPositions(samples.slice(0, 2), 1)).toEqual(samples.slice(0, 2));
  });

  it("takes jitter out of a slow line, more at a higher strength", () => {
    const samples = decodeSamples(encodeSamples(line(40, 3)).samples);
    const wobble = (points: typeof samples) =>
      points
        .slice(10)
        .reduce((sum, point, i, rest) => sum + Math.abs(point.y - (rest[i - 1]?.y ?? point.y)), 0);

    const light = wobble(smoothPositions(samples, 0.2));
    const heavy = wobble(smoothPositions(samples, 1));

    expect(light).toBeLessThan(wobble(samples));
    expect(heavy).toBeLessThan(light);
  });

  it("averages pressure over the samples a few milliseconds either side", () => {
    const pressures = [0.2, 0.8, 0.2, 0.8, 0.2];
    const samples = [0, 10, 20, 60, 70].map((time, i) => ({
      x: i,
      y: 0,
      pressure: pressures[i],
      tiltX: 0,
      tiltY: 0,
      time,
    }));

    const smoothed = smoothPressure(samples).map((s) => s.pressure);
    // The first three are within 24 ms of each other; the last two only of each other.
    [0.4, 0.4, 0.4, 0.5, 0.5].forEach((expected, i) => expect(smoothed[i]).toBeCloseTo(expected));
  });
});

describe("dropCrowdedSamples and relaxPath", () => {
  const at = (x: number, y = 0) => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, time: x });

  it("drops samples a hair from the last kept one, but always keeps the last", () => {
    const kept = dropCrowdedSamples([at(0), at(0.5), at(2), at(2.4), at(4), at(4.3)]);

    expect(kept.map((sample) => sample.x)).toEqual([0, 2, 4.3]);
    expect(dropCrowdedSamples([at(0), at(0.2)]).map((sample) => sample.x)).toEqual([0]);
  });

  it("evens out a jittery path without moving its ends or bending a straight one", () => {
    const zigzag = [at(0), at(2, 1), at(4, -1), at(6, 1), at(8)];
    const relaxed = relaxPath(zigzag);
    const swing = (path: typeof zigzag) => Math.max(...path.map((sample) => Math.abs(sample.y)));

    expect(swing(relaxed)).toBeLessThan(swing(zigzag) / 2);
    expect([relaxed[0], relaxed[4]]).toEqual([zigzag[0], zigzag[4]]);
    expect(relaxPath([at(0), at(2), at(4)])).toEqual([at(0), at(2), at(4)]);
  });
});

describe("densify", () => {
  const sparse = [
    { x: 0, y: 0, pressure: 0.2, tiltX: 0, tiltY: 0, time: 0 },
    { x: 20, y: 0, pressure: 0.6, tiltX: 0, tiltY: 0, time: 16 },
    { x: 20, y: 20, pressure: 0.6, tiltX: 0, tiltY: 0, time: 32 },
  ];

  it("keeps every sample and fills the gaps so no step is longer than two units", () => {
    const dense = densify(sparse);

    expect(dense).toEqual(expect.arrayContaining(sparse));
    dense.slice(1).forEach((sample, i) => {
      expect(Math.hypot(sample.x - dense[i].x, sample.y - dense[i].y)).toBeLessThanOrEqual(2.5);
    });
  });

  it("rounds a corner rather than cutting straight across it, and blends the pressure", () => {
    const dense = densify(sparse);
    const between = dense.slice(1, dense.indexOf(sparse[1]));

    // Heading for the turn, the curve swings out past the straight line between samples.
    expect(between.some((sample) => sample.y < 0)).toBe(true);
    const pressures = between.map((sample) => sample.pressure);
    expect(pressures).toEqual([...pressures].sort((a, b) => a - b));
    expect(Math.min(...pressures)).toBeGreaterThan(0.2);
  });

  it("leaves a dot or a stroke with nothing to fill alone", () => {
    expect(densify(sparse.slice(0, 1))).toEqual(sparse.slice(0, 1));
    expect(densify(line(3).map((sample) => ({ ...sample, x: sample.x / 4 })))).toHaveLength(3);
  });
});

describe("strokeOutline", () => {
  const { samples } = encodeSamples(line(20));

  it("gives a closed polygon around the line", () => {
    const outline = strokeOutline({ samples, width: 4, tool: "pen" });

    expect(outline.length).toBeGreaterThan(10);
    const ys = outline.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(4 + 0.01);
  });

  it("makes a pen line thinner where it is pressed lightly, but not a highlighter", () => {
    const light = encodeSamples(line(20).map((sample) => ({ ...sample, pressure: 0.1 }))).samples;
    const height = (outline: Array<[number, number]>) => {
      const ys = outline.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(height(strokeOutline({ samples: light, width: 8, tool: "pen" }))).toBeLessThan(
      height(strokeOutline({ samples, width: 8, tool: "pen" })),
    );
    expect(height(strokeOutline({ samples: light, width: 8, tool: "highlighter" }))).toBeCloseTo(
      height(strokeOutline({ samples, width: 8, tool: "highlighter" })),
    );
  });

  it("draws a single tap as a dot", () => {
    const dot = encodeSamples(line(1)).samples;

    expect(strokeOutline({ samples: dot, width: 6, tool: "pen" }, 0).length).toBeGreaterThan(3);
  });
});

describe("strokeBounds", () => {
  it("covers every sample, offset by the origin, with room for the width", () => {
    const { samples } = encodeSamples(line(3));

    expect(strokeBounds({ x: 10, y: 20, samples, width: 2 })).toEqual({
      x: 8,
      y: 18,
      width: 12,
      height: 4,
    });
  });
});
