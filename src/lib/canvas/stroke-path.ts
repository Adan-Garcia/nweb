import type { StrokeSample } from "./stroke-geometry";

/**
 * The path of a stroke, cleaned up before it is outlined: the hand's shake smoothed out,
 * samples too close to tell apart dropped, the hooks at its ends taken off, and the gaps
 * filled in along a curve. Pure; `strokeOutline` runs them in order. Distances are in
 * scene units, which the caller scales from screen pixels by the zoom it was drawn at.
 */
/**
 * How far along the line the strongest smoothing averages over, in screen pixels: one
 * standard deviation of its weighting at strength 1, for a pen moving slowly.
 */
const MAX_SMOOTHING_RADIUS = 12;

/**
 * The pen speed, in screen pixels a millisecond, at which the reach is halved. Slow, careful
 * lines (where the hand's shake shows) get nearly all of it; writing at speed gets a third
 * or less, so the loop of a small "e" keeps its shape.
 */
const HALF_REACH_SPEED = 0.25;

/** How far either side of a sample, in time, its speed is measured over. */
const SPEED_WINDOW_MS = 16;

/** Each sample's distance along the line from the first. */
function distancesAlong(samples: readonly StrokeSample[]): number[] {
  const along = [0];
  for (let i = 1; i < samples.length; i += 1) {
    const step = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    along.push(along[i - 1] + step);
  }

  return along;
}

/** How fast the pen moved around each sample, in scene units a millisecond. */
function speedsAround(samples: readonly StrokeSample[], along: readonly number[]): number[] {
  let from = 0;
  let to = 0;

  return samples.map((sample) => {
    while (sample.time - samples[from].time > SPEED_WINDOW_MS) {
      from += 1;
    }
    while (to + 1 < samples.length && samples[to + 1].time - sample.time <= SPEED_WINDOW_MS) {
      to += 1;
    }
    const elapsed = samples[to].time - samples[from].time;

    // No time between them (one sample, or a stroke recorded without times): treat as slow.
    return elapsed > 0 ? (along[to] - along[from]) / elapsed : 0;
  });
}

/**
 * Takes the hand's shake out of a line: each sample moves to a weighted average of the
 * samples around it, weighted by how far away they are along the line. Centred, so unlike
 * a filter that runs with the pen it has no lag to catch up on (which on a slow stroke
 * came out as straight runs between kinks), and by distance rather than by count, so a
 * slow stroke's crowded samples are smoothed by the same length as a quick one's. Where
 * the pen moved slowly it reaches further, where it moved quickly less.
 *
 * Past either end the line is continued by its own reflection through the end, which
 * keeps the ends where the pen was and stops them being pulled in toward the middle.
 * `strength` 0 returns the input; the reach is in screen pixels, divided by `zoom`.
 */
export function smoothPositions(
  samples: readonly StrokeSample[],
  strength: number,
  zoom = 1,
): StrokeSample[] {
  if (strength <= 0 || samples.length < 3) {
    return [...samples];
  }

  // Measured along an evened-out copy: the zigzag of shake would otherwise add length,
  // and the more a line shook the less it would be smoothed.
  const along = distancesAlong(relaxPath(samples, 1));
  const speeds = speedsAround(samples, along);
  const last = samples.length - 1;
  const first = samples[0];
  const end = samples[last];

  return samples.map((sample, i) => {
    if (i === 0 || i === last) {
      return sample;
    }

    const slowness = 1 / (1 + (speeds[i] * zoom) / HALF_REACH_SPEED);
    const sigma = (MAX_SMOOTHING_RADIUS * Math.min(strength, 1) * slowness) / zoom;
    const reach = sigma * 3;
    let x = 0;
    let y = 0;
    let total = 0;
    const add = (px: number, py: number, at: number) => {
      const weight = Math.exp(-((at - along[i]) ** 2) / (2 * sigma * sigma));
      x += px * weight;
      y += py * weight;
      total += weight;
    };

    for (let k = 0; k <= last; k += 1) {
      if (Math.abs(along[k] - along[i]) <= reach) {
        add(samples[k].x, samples[k].y, along[k]);
      }
      // The reflections through the first and the last sample.
      if (k > 0 && along[i] + along[k] <= reach) {
        add(2 * first.x - samples[k].x, 2 * first.y - samples[k].y, -along[k]);
      }
      if (k < last && 2 * along[last] - along[k] - along[i] <= reach) {
        add(2 * end.x - samples[k].x, 2 * end.y - samples[k].y, 2 * along[last] - along[k]);
      }
    }

    return { ...sample, x: x / total, y: y / total };
  });
}

/** The shortest step kept between samples, in screen pixels at the zoom it was drawn. */
export const MIN_STEP = 1.5;

/**
 * Drops samples closer than `minStep` to the last one kept. A slow stroke
 * reports many samples a hair apart, and the outline's edge is set square to the step
 * between neighbours: steps that short point every which way with the sensor's jitter, and
 * the edge comes out lumpy. A last sample a hair from the one before is dropped too,
 * rather than kept in its place: the pen settling as it lifts often moves it back a
 * fraction, and that tiny turn is a hook the outline draws a round cap on.
 */
export function dropCrowdedSamples(
  samples: readonly StrokeSample[],
  minStep = MIN_STEP,
): StrokeSample[] {
  const kept: StrokeSample[] = [];

  for (const sample of samples) {
    const previous = kept.at(-1);
    if (!previous || Math.hypot(sample.x - previous.x, sample.y - previous.y) >= minStep) {
      kept.push(sample);
    }
  }

  return kept;
}

/** Drops the steps at the end of `path` that double back on the way it was heading. */
function trimEnd(path: StrokeSample[], reach: number): StrokeSample[] {
  const along = distancesAlong(path);
  const length = along.at(-1) ?? 0;
  // The tail is the last `reach` of the line; where it was heading is the stretch before.
  const tail = along.findIndex((at) => length - at <= reach);
  const before = along.findLastIndex((at) => at <= along[tail] - reach);
  if (tail < 1 || before < 0) {
    return path;
  }

  const heading = { x: path[tail].x - path[before].x, y: path[tail].y - path[before].y };
  let last = path.length - 1;
  while (last > tail) {
    const step = { x: path[last].x - path[last - 1].x, y: path[last].y - path[last - 1].y };
    if (step.x * heading.x + step.y * heading.y >= 0) {
      break;
    }
    last -= 1;
  }

  return path.slice(0, last + 1);
}

/**
 * Takes off the little hooks a pen leaves at either end of a line: a flick back as it
 * lifts, or a skid as it lands. Only steps within `reach` of an end that turn back on the
 * line's heading go; a line that really does double back further in is left alone.
 */
export function trimHooks(samples: readonly StrokeSample[], reach: number): StrokeSample[] {
  if (samples.length < 4) {
    return [...samples];
  }

  return trimEnd(trimEnd([...samples], reach).reverse(), reach).reverse();
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

/** The longest straight step left once a stroke is densified, in screen pixels. */
export const MAX_STEP = 2;

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
