/**
 * Three-way merge: what two people did to the same starting point, kept together.
 *
 * The server cannot merge ciphertext, so this runs on the device that notices two versions
 * disagree. It needs the version both sides started from — the *base* — because without it
 * "the line is different" cannot say *who* changed it, and so cannot say which side to keep.
 * With it the rule is the ordinary one: a change beats no change, and where both changed the
 * same piece the side the caller prefers (the later edit) wins that piece and nothing else.
 *
 * Everything here is pure. Opening, decompressing and sealing are `merge-row.ts`'s job;
 * a canvas has a merge of its own in `merge-scene.ts`.
 */
export type Side = "local" | "remote";

/** Whichever side changed from the base, or the preferred side when both did. */
function pick<T>(base: T, local: T, remote: T, prefer: Side, same: (a: T, b: T) => boolean): T {
  if (same(local, remote) || same(remote, base)) {
    return local;
  }

  if (same(local, base)) {
    return remote;
  }

  return prefer === "local" ? local : remote;
}

/** Pairs of indices a longest common subsequence matches, in order. */
function matches(base: readonly string[], other: readonly string[]): Map<number, number> {
  const rows = base.length + 1;
  const columns = other.length + 1;
  const lengths = new Uint32Array(rows * columns);

  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = other.length - 1; j >= 0; j -= 1) {
      lengths[i * columns + j] =
        base[i] === other[j]
          ? lengths[(i + 1) * columns + j + 1] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
    }
  }

  const matched = new Map<number, number>();
  let i = 0;
  let j = 0;

  while (i < base.length && j < other.length) {
    if (base[i] === other[j]) {
      matched.set(i, j);
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return matched;
}

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

/**
 * diff3 over a list: the stretches both sides left alone anchor the merge, and each gap
 * between two anchors is resolved as a whole — or item by item, when it was edited in place.
 *
 * Two people editing different paragraphs keep both edits, adjacent ones included; two
 * editing the same paragraph leave one, which goes to the preferred side. A gap where lines
 * were added or removed on both sides is the unit of conflict, and goes the same way.
 */
export function mergeLists(
  base: readonly string[],
  local: readonly string[],
  remote: readonly string[],
  prefer: Side,
): string[] {
  const toLocal = matches(base, local);
  const toRemote = matches(base, remote);
  const merged: string[] = [];
  let [b, l, r] = [0, 0, 0];

  const flush = (nextB: number, nextL: number, nextR: number) => {
    const gap = [base.slice(b, nextB), local.slice(l, nextL), remote.slice(r, nextR)] as const;

    // Every side has the same number of items here, so each one was edited in place rather
    // than added or removed. Resolving them one by one is what keeps edits to two adjacent
    // paragraphs — which share no untouched neighbour to anchor on — from clashing.
    if (gap[0].length === gap[1].length && gap[0].length === gap[2].length) {
      merged.push(
        ...gap[0].map((item, index) =>
          pick(item, gap[1][index], gap[2][index], prefer, (x, y) => x === y),
        ),
      );
      return;
    }

    merged.push(...pick(gap[0], gap[1], gap[2], prefer, sameList));
  };

  for (let index = 0; index < base.length; index += 1) {
    const atLocal = toLocal.get(index);
    const atRemote = toRemote.get(index);

    if (atLocal === undefined || atRemote === undefined) {
      continue;
    }

    flush(index, atLocal, atRemote);
    merged.push(base[index]);
    [b, l, r] = [index + 1, atLocal + 1, atRemote + 1];
  }

  flush(base.length, local.length, remote.length);

  return merged;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** A tag, with quoted attribute values allowed to contain `>`. */
const TAG = /<(\/?)([a-zA-Z][\w-]*)(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/g;

/**
 * Splits a rich-text note into its top-level blocks: a paragraph, a heading, a whole list.
 *
 * A block is the unit a merge keeps or replaces, which is coarse on purpose — splicing
 * inside a paragraph without a model of what the markup means is how a merge produces HTML
 * nobody wrote. Anything that does not split back into exactly what it came from is taken
 * as one block, so a merge can be conservative but never corrupting.
 */
export function splitHtmlBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;

  for (const match of html.matchAll(TAG)) {
    const [whole, closing, name, selfClosing] = match;
    const isVoid = VOID_ELEMENTS.has(name.toLowerCase()) || selfClosing === "/";

    if (depth === 0 && match.index > start) {
      blocks.push(html.slice(start, match.index));
      start = match.index;
    }

    if (closing) {
      depth -= 1;
    } else if (!isVoid) {
      depth += 1;
    }

    if (depth === 0) {
      blocks.push(html.slice(start, match.index + whole.length));
      start = match.index + whole.length;
    }
  }

  if (start < html.length) {
    blocks.push(html.slice(start));
  }

  return depth === 0 && blocks.join("") === html ? blocks : [html];
}

/** Two edits of one rich-text note, merged paragraph by paragraph. */
export function mergeHtml(base: string, local: string, remote: string, prefer: Side): string {
  return mergeLists(
    splitHtmlBlocks(base),
    splitHtmlBlocks(local),
    splitHtmlBlocks(remote),
    prefer,
  ).join("");
}

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/**
 * A record merged field by field: a title renamed on one device and a tag added on the
 * other both survive. `base` may be null for a row nobody has a common version of, which
 * makes every disagreement a conflict and so the preferred side's.
 */
export function mergeFields(
  base: Record<string, unknown> | null,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  prefer: Side,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    merged[key] = base
      ? pick(base[key], local[key], remote[key], prefer, sameValue)
      : pick(undefined, local[key], remote[key], prefer, sameValue);
  }

  return merged;
}
