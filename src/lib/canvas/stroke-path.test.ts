import { describe, expect, it } from "vitest";

import { decodeSamples, encodeSamples, type InputSample } from "./stroke-geometry";
import { densify, dropCrowdedSamples, relaxPath, smoothPositions, trimHooks } from "./stroke-path";

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

describe("smoothPositions", () => {
  it("leaves the samples alone at strength 0 or when there are too few", () => {
    const samples = decodeSamples(encodeSamples(line(10, 3)).samples);

    expect(smoothPositions(samples, 0)).toEqual(samples);
    expect(smoothPositions(samples.slice(0, 2), 1)).toEqual(samples.slice(0, 2));
  });

  it("takes jitter out of a slow line, more at a higher strength", () => {
    // A slow hand: samples a pixel apart, shaking a pixel either side.
    const slow = line(60, 1).map((sample, i) => ({ ...sample, x: 100 + i }));
    const samples = decodeSamples(encodeSamples(slow).samples);
    const wobble = (points: typeof samples) =>
      points
        .slice(10)
        .reduce((sum, point, i, rest) => sum + Math.abs(point.y - (rest[i - 1]?.y ?? point.y)), 0);

    const light = wobble(smoothPositions(samples, 0.2));
    const heavy = wobble(smoothPositions(samples, 1));

    expect(light).toBeLessThan(wobble(samples));
    expect(heavy).toBeLessThan(light);
  });

  it("smooths where the pen moved slowly more than where it moved quickly", () => {
    const shaky = (msPerSample: number) =>
      line(120).map((sample, i) => ({
        ...sample,
        x: 100 + i,
        // A shake about nine pixels long: longer than a quick stroke's reach.
        y: 50 + Math.sin(i * 0.7),
        time: i * msPerSample,
      }));
    // Away from the ends, which stay where the pen was.
    const wobble = (points: InputSample[]) =>
      points.slice(30, -30).reduce((sum, point) => sum + Math.abs(point.y - 50), 0);

    const slow = wobble(smoothPositions(shaky(16), 0.5));
    const quick = wobble(smoothPositions(shaky(1), 0.5));

    expect(slow).toBeLessThan(quick);
    // A stroke with no times between its samples counts as slow, never as infinitely fast.
    expect(wobble(smoothPositions(shaky(0), 0.5))).toBeCloseTo(
      wobble(smoothPositions(shaky(1e6), 0.5)),
    );
  });

  it("does not lag the pen: a line ends where it lifted, and a straight one stays put", () => {
    // Slow, then fast: a filter running with the pen trails it, then snaps to catch up.
    const times = [0, 40, 80, 120, 160, 170, 180, 190, 200, 210];
    const straight = times.map((time, i) => ({ ...line(1)[0], x: i * 3, y: i * 3, time }));
    const smoothed = smoothPositions(straight, 1);

    expect(smoothed.at(-1)).toEqual(straight.at(-1));
    smoothed.forEach((sample, i) => {
      expect(sample.x).toBeCloseTo(straight[i].x);
      expect(sample.y).toBeCloseTo(sample.x);
    });
  });

  it("smooths in screen pixels: the same hand movement at any zoom is smoothed alike", () => {
    const screen = decodeSamples(encodeSamples(line(40, 3)).samples);
    // Drawn zoomed out to 25%, the same movement covers four times as much of the scene.
    const zoomedOut = screen.map((sample) => ({ ...sample, x: sample.x * 4, y: sample.y * 4 }));

    const atScreen = smoothPositions(screen, 0.5, 1);
    const atScene = smoothPositions(zoomedOut, 0.5, 0.25);
    atScene.forEach((sample, i) => {
      expect(sample.x).toBeCloseTo(atScreen[i].x * 4);
      expect(sample.y).toBeCloseTo(atScreen[i].y * 4);
    });
  });
});

describe("dropCrowdedSamples and relaxPath", () => {
  const at = (x: number, y = 0) => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, time: x });

  it("drops samples a hair from the last kept one, the last one too", () => {
    // Moving the last kept sample onto a lift a hair away would leave a hook at the end.
    const kept = dropCrowdedSamples([at(0), at(0.5), at(2), at(2.4), at(4), at(4.3)]);

    expect(kept.map((sample) => sample.x)).toEqual([0, 2, 4]);
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

describe("trimHooks", () => {
  const at = (x: number, y = 0) => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, time: 0 });
  const across = Array.from({ length: 11 }, (_, i) => at(i * 4));

  it("takes off a flick back as the pen lifts and a skid as it lands", () => {
    const hooked = [at(2, 2), ...across, at(38, 1)];

    expect(trimHooks(hooked, 5)).toEqual(across);
  });

  it("leaves a line that really doubles back, and a short one, alone", () => {
    const uTurn = [
      ...across,
      ...across
        .slice(0, -1)
        .reverse()
        .map((s) => ({ ...s, y: 10 })),
    ];

    expect(trimHooks(across, 5)).toEqual(across);
    expect(trimHooks(uTurn, 5)).toHaveLength(uTurn.length);
    expect(trimHooks([at(0), at(4), at(1)], 5)).toHaveLength(3);
    expect(trimHooks([at(0), at(1), at(2), at(1)], 50)).toHaveLength(4);
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
