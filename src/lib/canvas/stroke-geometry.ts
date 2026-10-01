import { getStroke } from "perfect-freehand";

import { expandRect, type Point, type Rect, rectFromPoints } from "./geometry";
import { DEFAULT_SENSITIVITY, DEFAULT_SMOOTHING } from "./pen-settings";
import { SAMPLE_STRIDE, type Stroke } from "./scene-model";

/** One pen sample as the input layer reports it, in the stroke's coordinate space. */
export type InputSample = {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  /** Milliseconds, from the event's `timeStamp`. */
  time: number;
};

/** A stored sample, read back: position relative to the stroke's origin, time from its start. */
export type StrokeSample = InputSample;

/**
 * Each sample's pressure, between 0 and 1. A pointer with no pressure sensor (a mouse,
 * most fingers) reports 0.5 while pressed, or 0 throughout, and draws at the pen's base
 * width. A pen often reports 0 on the sample it touches down with, before its sensor has a
 * reading; that sample takes the first real one rather than starting the line on a blob.
 */
function pressuresOf(input: readonly InputSample[]): number[] {
  let last = input.find((sample) => sample.pressure > 0)?.pressure ?? 0.5;

  return input.map((sample) => {
    if (sample.pressure > 0) {
      last = sample.pressure;
    }

    return Math.min(last, 1);
  });
}

/** Turns input samples into a stroke's origin and flat, relative sample array. */
export function encodeSamples(input: readonly InputSample[]): { origin: Point; samples: number[] } {
  const origin = input.length ? { x: input[0].x, y: input[0].y } : { x: 0, y: 0 };
  const samples: number[] = [];
  const pressures = pressuresOf(input);

  input.forEach((sample, i) => {
    const dt = i === 0 ? 0 : Math.max(0, sample.time - input[i - 1].time);
    samples.push(
      sample.x - origin.x,
      sample.y - origin.y,
      pressures[i],
      sample.tiltX,
      sample.tiltY,
      dt,
    );
  });

  return { origin, samples };
}

/** The stored samples as objects, relative to the stroke's origin, with running time. */
export function decodeSamples(samples: readonly number[]): StrokeSample[] {
  const decoded: StrokeSample[] = [];
  let time = 0;

  for (let i = 0; i + SAMPLE_STRIDE <= samples.length; i += SAMPLE_STRIDE) {
    time += samples[i + 5];
    decoded.push({
      x: samples[i],
      y: samples[i + 1],
      pressure: samples[i + 2],
      tiltX: samples[i + 3],
      tiltY: samples[i + 4],
      time,
    });
  }

  return decoded;
}

const lowPass = (previous: number, next: number, alpha: number) =>
  previous + alpha * (next - previous);

function smoothingAlpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);

  return 1 / (1 + tau / dtSeconds);
}

/**
 * A one-euro filter over position: heavy smoothing when the pen moves slowly (where jitter
 * shows) and little when it moves fast (where lag would). `strength` 0 returns the input.
 */
export function smoothPositions(
  samples: readonly StrokeSample[],
  strength: number,
  zoom = 1,
): StrokeSample[] {
  if (strength <= 0 || samples.length < 3) {
    return [...samples];
  }

  const minCutoff = 10 - 9.2 * Math.min(strength, 1);
  const beta = 0.02;
  const derivativeCutoff = 1;
  const smoothed: StrokeSample[] = [samples[0]];
  let speed = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const previous = smoothed[i - 1];
    const sample = samples[i];
    const dt = Math.max(sample.time - samples[i - 1].time, 1) / 1000;
    // In screen pixels a second: how fast the hand moved, whatever the zoom.
    const rawSpeed = (Math.hypot(sample.x - previous.x, sample.y - previous.y) * zoom) / dt;
    speed = lowPass(speed, rawSpeed, smoothingAlpha(derivativeCutoff, dt));
    const alpha = smoothingAlpha(minCutoff + beta * speed, dt);

    smoothed.push({
      ...sample,
      x: lowPass(previous.x, sample.x, alpha),
      y: lowPass(previous.y, sample.y, alpha),
    });
  }

  return smoothed;
}

/** How far either side of a sample, in time, its pressure is averaged over. */
const PRESSURE_WINDOW_MS = 24;

/**
 * Pressure averaged over the samples within a few milliseconds of each one. By time, not
 * by count: a pen reporting at 240 Hz would otherwise average over a sliver of a stroke and
 * let its sensor's noise ripple the edges, while a quick stroke would keep the jumps a
 * light flick makes between its few samples.
 */
export function smoothPressure(samples: readonly StrokeSample[]): StrokeSample[] {
  const sums = [0];
  samples.forEach((sample, i) => sums.push(sums[i] + sample.pressure));
  let from = 0;
  let to = 0;

  return samples.map((sample) => {
    while (sample.time - samples[from].time > PRESSURE_WINDOW_MS) {
      from += 1;
    }
    while (to < samples.length && samples[to].time - sample.time <= PRESSURE_WINDOW_MS) {
      to += 1;
    }

    return { ...sample, pressure: (sums[to] - sums[from]) / (to - from) };
  });
}

/** The shortest step kept between samples before the outline is built. */
/** The shortest step kept between samples, in screen pixels at the zoom it was drawn. */
const MIN_STEP = 1.5;

/**
 * Drops samples closer than `minStep` to the last one kept. A slow stroke
 * reports many samples a hair apart, and the outline's edge is set square to the step
 * between neighbours: steps that short point every which way with the sensor's jitter, and
 * the edge comes out lumpy. The last sample always stays, so the line still ends where
 * the pen lifted.
 */
export function dropCrowdedSamples(
  samples: readonly StrokeSample[],
  minStep = MIN_STEP,
): StrokeSample[] {
  const kept: StrokeSample[] = [];

  samples.forEach((sample, i) => {
    const previous = kept.at(-1);
    if (!previous || Math.hypot(sample.x - previous.x, sample.y - previous.y) >= minStep) {
      kept.push(sample);
    } else if (i === samples.length - 1 && kept.length > 1) {
      kept[kept.length - 1] = sample;
    }
  });

  return kept;
}

/**
 * Moves each sample halfway toward the midpoint of its neighbours, `passes` times. A
 * centred average, unlike the one-euro filter, does not lag the pen; it takes out the
 * small corners the sensor's jitter leaves on a slow stroke. The ends stay where they are.
 */
export function relaxPath(samples: readonly StrokeSample[], passes = 2): StrokeSample[] {
  let path = [...samples];
  for (let pass = 0; pass < passes; pass += 1) {
    path = path.map((sample, i) => {
      const before = path[i - 1];
      const after = path[i + 1];
      if (!before || !after) {
        return sample;
      }

      return {
        ...sample,
        x: (before.x + 2 * sample.x + after.x) / 4,
        y: (before.y + 2 * sample.y + after.y) / 4,
      };
    });
  }

  return path;
}

/** The longest straight step left between two samples once a stroke is densified. */
/** The longest straight step left once a stroke is densified, in screen pixels. */
const MAX_STEP = 2;

/**
 * Fills in the path between samples along a Catmull-Rom curve, so a stroke sampled at a
 * screen's refresh rate (Safari on an iPad, with no coalesced events) still bends smoothly
 * instead of turning a fast curve into a few straight facets. Pressure is interpolated
 * along it; the samples themselves are kept as they are.
 */
export function densify(samples: readonly StrokeSample[], maxStep = MAX_STEP): StrokeSample[] {
  if (samples.length < 2) {
    return [...samples];
  }

  const dense: StrokeSample[] = [samples[0]];
  for (let i = 0; i + 1 < samples.length; i += 1) {
    const p0 = samples[Math.max(0, i - 1)];
    const p1 = samples[i];
    const p2 = samples[i + 1];
    const p3 = samples[Math.min(samples.length - 1, i + 2)];
    const steps = Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / maxStep);

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const curve = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b +
          (c - a) * t +
          (2 * a - 5 * b + 4 * c - d) * t * t +
          (3 * b - a - 3 * c + d) * t * t * t);

      dense.push({
        ...p1,
        x: curve(p0.x, p1.x, p2.x, p3.x),
        y: curve(p0.y, p1.y, p2.y, p3.y),
        pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
        time: p1.time + (p2.time - p1.time) * t,
      });
    }
    dense.push(p2);
  }

  return dense;
}

/**
 * The filled outline of a stroke, relative to its origin: a closed polygon to fill in one
 * call. perfect-freehand's own smoothing of the path is off (`streamline: 0`); ours has
 * already run, and two smoothers in a row lag the pen.
 */
export function strokeOutline(
  stroke: Pick<Stroke, "samples" | "width" | "tool" | "sensitivity" | "zoom">,
  smoothing: number = DEFAULT_SMOOTHING,
): Array<[number, number]> {
  // Steps are measured on the screen it was drawn on: a scene unit is a fifth of a pixel
  // zoomed out to 20%, and five pixels zoomed in to 500%.
  const zoom = stroke.zoom ?? 1;
  const positions = smoothPositions(decodeSamples(stroke.samples), smoothing, zoom);
  const kept = dropCrowdedSamples(smoothPressure(positions), MIN_STEP / zoom);
  const samples = relaxPath(densify(kept, MAX_STEP / zoom), Math.round(smoothing * 4));
  const isPen = stroke.tool === "pen";

  return getStroke(
    samples.map((sample) => [sample.x, sample.y, sample.pressure]),
    {
      size: stroke.width,
      thinning: isPen ? (stroke.sensitivity ?? DEFAULT_SENSITIVITY) : 0,
      smoothing: 0.5,
      streamline: 0,
      simulatePressure: false,
      last: true,
    },
  ).map(([x, y]): [number, number] => [x, y]);
}

/** Where a stroke reaches, in the space its `x` and `y` are in, with room for its width. */
export function strokeBounds(stroke: Pick<Stroke, "x" | "y" | "samples" | "width">): Rect {
  const points = decodeSamples(stroke.samples).map((sample) => ({
    x: stroke.x + sample.x,
    y: stroke.y + sample.y,
  }));

  return expandRect(rectFromPoints(points), stroke.width);
}
