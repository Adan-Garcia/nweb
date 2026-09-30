import { getStroke } from "perfect-freehand";

import { expandRect, type Point, type Rect, rectFromPoints } from "./geometry";
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

/** How much a stroke is smoothed, from 0 (raw) to 1. A setting; this is its default. */
export const DEFAULT_SMOOTHING = 0.5;

/**
 * A pointer with no pressure sensor (a mouse, most fingers) reports 0.5 while pressed, and
 * some report 0. Either way it should draw at the pen's base width.
 */
function normalizePressure(pressure: number): number {
  return pressure > 0 ? Math.min(pressure, 1) : 0.5;
}

/** Turns input samples into a stroke's origin and flat, relative sample array. */
export function encodeSamples(input: readonly InputSample[]): { origin: Point; samples: number[] } {
  const origin = input.length ? { x: input[0].x, y: input[0].y } : { x: 0, y: 0 };
  const samples: number[] = [];

  input.forEach((sample, i) => {
    const dt = i === 0 ? 0 : Math.max(0, sample.time - input[i - 1].time);
    samples.push(
      sample.x - origin.x,
      sample.y - origin.y,
      normalizePressure(sample.pressure),
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
    const rawSpeed = Math.hypot(sample.x - previous.x, sample.y - previous.y) / dt;
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

/** Pressure averaged over each sample and its neighbours, so one noisy reading cannot pinch a line. */
export function smoothPressure(samples: readonly StrokeSample[]): StrokeSample[] {
  return samples.map((sample, i) => {
    const window = samples.slice(Math.max(0, i - 1), i + 2);

    return { ...sample, pressure: window.reduce((sum, s) => sum + s.pressure, 0) / window.length };
  });
}

/**
 * The filled outline of a stroke, relative to its origin: a closed polygon to fill in one
 * call. perfect-freehand's own smoothing of the path is off (`streamline: 0`); ours has
 * already run, and two smoothers in a row lag the pen.
 */
export function strokeOutline(
  stroke: Pick<Stroke, "samples" | "width" | "tool">,
  smoothing: number = DEFAULT_SMOOTHING,
): Array<[number, number]> {
  const samples = smoothPressure(smoothPositions(decodeSamples(stroke.samples), smoothing));
  const isPen = stroke.tool === "pen";

  return getStroke(
    samples.map((sample) => [sample.x, sample.y, sample.pressure]),
    {
      size: stroke.width,
      thinning: isPen ? 0.6 : 0,
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
