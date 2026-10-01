import { getStroke } from "perfect-freehand";

import { expandRect, type Point, type Rect, rectFromPoints } from "./geometry";
import { DEFAULT_SENSITIVITY, DEFAULT_SMOOTHING } from "./pen-settings";
import { SAMPLE_STRIDE, type Stroke } from "./scene-model";
import {
  densify,
  dropCrowdedSamples,
  MAX_STEP,
  MIN_STEP,
  relaxPath,
  smoothPositions,
  trimHooks,
} from "./stroke-path";

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

/** How close to an end, in screen pixels beyond half the line's width, a hook is taken off. */
const HOOK_REACH = 4;

/**
 * The filled outline of a stroke, relative to its origin: a closed polygon to fill in one
 * call. perfect-freehand's own smoothing of the path is off (`streamline: 0`); ours has
 * already run, and two smoothers in a row lag the pen.
 */
export function strokeOutline(
  stroke: Pick<Stroke, "samples" | "width" | "tool" | "sensitivity" | "smoothing" | "zoom">,
): Array<[number, number]> {
  // Steps are measured on the screen it was drawn on: a scene unit is a fifth of a pixel
  // zoomed out to 20%, and five pixels zoomed in to 500%.
  const zoom = stroke.zoom ?? 1;
  const smoothing = stroke.smoothing ?? DEFAULT_SMOOTHING;
  const positions = smoothPositions(decodeSamples(stroke.samples), smoothing, zoom);
  const crowded = dropCrowdedSamples(smoothPressure(positions), MIN_STEP / zoom);
  const kept = trimHooks(crowded, HOOK_REACH / zoom + stroke.width / 2);
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
