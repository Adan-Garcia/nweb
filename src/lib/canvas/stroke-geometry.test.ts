import { describe, expect, it } from "vitest";

import {
  decodeSamples,
  encodeSamples,
  type InputSample,
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

describe("smoothPressure", () => {
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

  it("keeps finer detail for a stroke drawn zoomed in, where a scene unit is several pixels", () => {
    const fine = encodeSamples(line(20).map((sample) => ({ ...sample, x: sample.x / 4 }))).samples;
    const outline = (zoom: number) => strokeOutline({ samples: fine, width: 1, tool: "pen", zoom });

    expect(outline(4).length).toBeGreaterThan(outline(1).length);
  });

  it("thins a pen line with pressure as much as its sensitivity says, not at all at 0", () => {
    const light = encodeSamples(line(20).map((sample) => ({ ...sample, pressure: 0.1 }))).samples;
    const height = (sensitivity: number, samples = light) => {
      const ys = strokeOutline({ samples, width: 8, tool: "pen", sensitivity }).map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(height(1)).toBeLessThan(height(0.45));
    expect(height(0)).toBeCloseTo(height(0, samples));
  });

  it("draws a single tap as a dot", () => {
    const dot = encodeSamples(line(1)).samples;

    expect(
      strokeOutline({ samples: dot, width: 6, tool: "pen", smoothing: 0 }).length,
    ).toBeGreaterThan(3);
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
