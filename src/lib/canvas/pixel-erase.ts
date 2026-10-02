import { keysBetween } from "./fractional-index";
import { distance, distanceToSegment, type Point } from "./geometry";
import type { Stroke } from "./scene-model";
import { decodeSamples, encodeSamples, type StrokeSample } from "./stroke-geometry";

/** What is left of a stroke after the pixel eraser passes: pieces in the stroke's space. */
export type StrokePiece = { x: number; y: number; samples: number[] };

/**
 * Adds samples along any segment longer than `step`, so an eraser that crosses a fast
 * stroke between two of its samples still cuts it.
 */
function densify(samples: readonly StrokeSample[], step: number): StrokeSample[] {
  const dense: StrokeSample[] = [];
  samples.forEach((sample, i) => {
    const previous = samples[i - 1];
    if (previous) {
      const parts = Math.floor(distance(previous, sample) / step);
      for (let part = 1; part <= parts; part += 1) {
        const t = part / (parts + 1);
        const mix = (a: number, b: number) => a + (b - a) * t;
        dense.push({
          x: mix(previous.x, sample.x),
          y: mix(previous.y, sample.y),
          pressure: mix(previous.pressure, sample.pressure),
          tiltX: mix(previous.tiltX, sample.tiltX),
          tiltY: mix(previous.tiltY, sample.tiltY),
          time: mix(previous.time, sample.time),
        });
      }
    }
    dense.push(sample);
  });

  return dense;
}

function nearPath(point: Point, path: readonly Point[], reach: number): boolean {
  if (path.length === 1) {
    return distance(point, path[0]) <= reach;
  }

  return path.some((end, i) => i > 0 && distanceToSegment(point, path[i - 1], end) <= reach);
}

/**
 * Cuts a stroke where the eraser's path (in the stroke's space) passed within `radius` of
 * it. Returns null when the stroke is untouched, otherwise the pieces that remain (none
 * when it was erased whole). A leftover of one sample is dropped rather than kept as a
 * stray dot.
 */
export function cutStroke(
  stroke: Stroke,
  eraserPath: readonly Point[],
  radius: number,
): StrokePiece[] | null {
  const reach = radius + stroke.width / 2;
  const samples = densify(
    decodeSamples(stroke.samples).map((sample) => ({
      ...sample,
      x: stroke.x + sample.x,
      y: stroke.y + sample.y,
    })),
    Math.max(radius / 2, 0.5),
  );
  const erased = samples.map((sample) => nearPath(sample, eraserPath, reach));
  if (!erased.includes(true)) {
    return null;
  }

  const runs: StrokeSample[][] = [];
  let run: StrokeSample[] = [];
  samples.forEach((sample, i) => {
    if (erased[i]) {
      runs.push(run);
      run = [];
    } else {
      run.push(sample);
    }
  });
  runs.push(run);

  return runs
    .filter((piece) => piece.length > 1)
    .map((piece) => {
      const { origin, samples: encoded } = encodeSamples(piece);

      return { x: origin.x, y: origin.y, samples: encoded };
    });
}

/**
 * The strokes that replace one cut into pieces: new ids (the original is deleted, so a
 * device that edited it at the same time keeps its edit rather than losing it to the cut),
 * and order keys between the original's and the next one up, so the pieces stay at the
 * same depth.
 */
export function piecesToStrokes(
  stroke: Stroke,
  pieces: readonly StrokePiece[],
  nextIndex: string | null,
  newId: () => string = () => crypto.randomUUID(),
): Stroke[] {
  const keys = keysBetween(stroke.index, nextIndex, pieces.length);

  return pieces.map((piece, i) => ({
    ...stroke,
    ...piece,
    id: newId(),
    version: 1,
    index: keys[i],
  }));
}
