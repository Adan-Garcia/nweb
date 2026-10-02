/**
 * Order keys that sort as strings, so a new element can always be given a key between any
 * two others without renumbering anything. Stacking order in a scene, and the order of the
 * pages in a paged note, are these keys; `lib/sync/merge-scene.ts` sorts by them.
 *
 * A key is an integer part (its first character says how long it is) followed by an
 * optional fraction. Appending to the end increments the integer, so a note drawn stroke
 * after stroke keeps short keys instead of one that grows with every stroke.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0];
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") {
    return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  }
  if (head >= "A" && head <= "Z") {
    return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new Error(`Invalid order key head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0]);
  if (length > key.length) {
    throw new Error(`Invalid order key: ${key}`);
  }

  return key.slice(0, length);
}

/** Sorts order keys by code unit, which is the order they were made to have. */
export function compareOrderKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whether `key` is a well-formed order key. */
export function isOrderKey(key: string): boolean {
  if (!key || key === SMALLEST_INTEGER || [...key].some((char) => !DIGITS.includes(char))) {
    return false;
  }

  try {
    const fraction = key.slice(integerPart(key).length);

    return !fraction.endsWith(ZERO);
  } catch {
    return false;
  }
}

function assertOrderKey(key: string): void {
  if (!isOrderKey(key)) {
    throw new Error(`Invalid order key: ${key}`);
  }
}

/** A fraction strictly between `a` and `b` (null is "one"), both without trailing zeros. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let shared = 0;
    while ((a[shared] ?? ZERO) === b[shared]) {
      shared += 1;
    }
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
    }
  }

  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;

  if (digitB - digitA > 1) {
    return DIGITS[Math.round((digitA + digitB) / 2)];
  }
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }

  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

function incrementInteger(integer: string): string | null {
  const [head, ...digits] = integer.split("");
  let carry = true;

  for (let i = digits.length - 1; carry && i >= 0; i -= 1) {
    const next = DIGITS.indexOf(digits[i]) + 1;
    if (next === DIGITS.length) {
      digits[i] = ZERO;
    } else {
      digits[i] = DIGITS[next];
      carry = false;
    }
  }

  if (!carry) {
    return head + digits.join("");
  }
  if (head === "Z") {
    return `a${ZERO}`;
  }
  if (head === "z") {
    return null;
  }

  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > "a") {
    digits.push(ZERO);
  } else {
    digits.pop();
  }

  return nextHead + digits.join("");
}

/** Never called on the smallest integer: `keyBefore` handles that one with a fraction. */
function decrementInteger(integer: string): string {
  const [head, ...digits] = integer.split("");
  const largest = DIGITS[DIGITS.length - 1];
  let borrow = true;

  for (let i = digits.length - 1; borrow && i >= 0; i -= 1) {
    const next = DIGITS.indexOf(digits[i]) - 1;
    if (next === -1) {
      digits[i] = largest;
    } else {
      digits[i] = DIGITS[next];
      borrow = false;
    }
  }

  if (!borrow) {
    return head + digits.join("");
  }
  if (head === "a") {
    return `Z${largest}`;
  }

  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (nextHead < "Z") {
    digits.push(largest);
  } else {
    digits.pop();
  }

  return nextHead + digits.join("");
}

function keyBefore(b: string): string {
  const integerB = integerPart(b);
  if (integerB === SMALLEST_INTEGER) {
    return integerB + midpoint("", b.slice(integerB.length));
  }
  if (integerB < b) {
    return integerB;
  }

  return decrementInteger(integerB);
}

/**
 * A key that sorts after `a` and before `b`. Null means "no bound": `(null, null)` is the
 * first key of an empty list, `(last, null)` goes on top, `(null, first)` goes underneath.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) {
    assertOrderKey(a);
  }
  if (b !== null) {
    assertOrderKey(b);
  }
  if (a !== null && b !== null && a >= b) {
    throw new Error(`Order keys out of order: ${a} >= ${b}`);
  }

  if (a === null) {
    return b === null ? `a${ZERO}` : keyBefore(b);
  }

  const integerA = integerPart(a);
  const fractionA = a.slice(integerA.length);

  if (b === null) {
    return incrementInteger(integerA) ?? integerA + midpoint(fractionA, null);
  }

  const integerB = integerPart(b);
  if (integerA === integerB) {
    return integerA + midpoint(fractionA, b.slice(integerB.length));
  }

  const incremented = incrementInteger(integerA);
  if (incremented !== null && incremented < b) {
    return incremented;
  }

  return integerA + midpoint(fractionA, null);
}

/** `count` keys in order, all after `a` and before `b`, spread so none of them is long. */
export function keysBetween(a: string | null, b: string | null, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [keyBetween(a, b)];
  }

  if (b === null) {
    const keys: string[] = [];
    let previous = a;
    for (let i = 0; i < count; i += 1) {
      previous = keyBetween(previous, null);
      keys.push(previous);
    }

    return keys;
  }

  if (a === null) {
    const keys: string[] = [];
    let next: string = b;
    for (let i = 0; i < count; i += 1) {
      next = keyBetween(null, next);
      keys.unshift(next);
    }

    return keys;
  }

  const half = Math.floor(count / 2);
  const middle = keyBetween(a, b);

  return [...keysBetween(a, middle, half), middle, ...keysBetween(middle, b, count - half - 1)];
}
