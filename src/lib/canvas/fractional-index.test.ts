import { describe, expect, it } from "vitest";

import { compareOrderKeys, isOrderKey, keyBetween, keysBetween } from "./fractional-index";

function isSorted(keys: string[]): boolean {
  return keys.every((key, index) => index === 0 || keys[index - 1] < key);
}

describe("keyBetween", () => {
  it("starts an empty list and keeps appended keys short", () => {
    const keys = [keyBetween(null, null)];
    for (let i = 0; i < 1000; i += 1) {
      keys.push(keyBetween(keys[keys.length - 1], null));
    }

    expect(keys[0]).toBe("a0");
    expect(isSorted(keys)).toBe(true);
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(3);
  });

  it("keeps prepended keys sorted and short", () => {
    const keys = ["a0"];
    for (let i = 0; i < 1000; i += 1) {
      keys.unshift(keyBetween(null, keys[0]));
    }

    expect(isSorted(keys)).toBe(true);
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(3);
  });

  it("always finds a key between two neighbours", () => {
    let low = "a0";
    let high = "a1";
    for (let i = 0; i < 200; i += 1) {
      const middle = keyBetween(low, high);
      expect(low < middle && middle < high).toBe(true);
      expect(isOrderKey(middle)).toBe(true);
      if (i % 2) {
        low = middle;
      } else {
        high = middle;
      }
    }
  });

  it("steps between integers of different lengths", () => {
    expect(keyBetween("Zz", null)).toBe("a0");
    expect(keyBetween(null, "a0")).toBe("Zz");
    expect(keyBetween("az", null)).toBe("b00");
    expect(keyBetween(null, "b00")).toBe("az");
    expect(keyBetween("a0", "a2")).toBe("a1");
    expect(keyBetween("a0", "a1")).toBe("a0V");
    expect(keyBetween("a0V", "a1")).toBe("a0l");
    expect(keyBetween(null, "a0V")).toBe("a0");
    expect(keyBetween("a0", "a0V")).toBe("a0G");
    expect(keyBetween("a0", "b00")).toBe("a1");
    expect(keyBetween("az", "b00")).toBe("azV");
    expect(keyBetween("a0z", "a1")).toBe("a0zV");
    expect(keyBetween("a0", "a01")).toBe("a00V");
    expect(keyBetween("a01", "a02V")).toBe("a02");
    expect(keyBetween("Yzz", null)).toBe("Z0");
  });

  it("uses a fraction at either end of the key space", () => {
    const largest = `z${"z".repeat(26)}`;
    expect(keyBetween(largest, null)).toBe(`${largest}V`);

    const smallest = `A${"0".repeat(26)}`;
    expect(keyBetween(null, `${smallest}V`)).toBe(`${smallest}G`);
  });

  it("refuses keys that are malformed or out of order", () => {
    expect(() => keyBetween("a1", "a0")).toThrow("out of order");
    expect(() => keyBetween("a0", "a0")).toThrow("out of order");
    expect(() => keyBetween("a10", null)).toThrow("Invalid order key");
    expect(() => keyBetween(null, "b0")).toThrow("Invalid order key");
    expect(() => keyBetween("!", null)).toThrow("Invalid order key");
  });
});

describe("keysBetween", () => {
  it("returns nothing for no keys", () => {
    expect(keysBetween("a0", "a1", 0)).toEqual([]);
  });

  it.each([
    [null, null],
    ["a5", null],
    [null, "a5"],
    ["a0", "a1"],
  ])("returns sorted, distinct keys between %s and %s", (low, high) => {
    const keys = keysBetween(low, high, 25);

    expect(keys).toHaveLength(25);
    expect(isSorted(keys)).toBe(true);
    expect(keys.every(isOrderKey)).toBe(true);
    if (low) {
      expect(keys[0] > low).toBe(true);
    }
    if (high) {
      expect(keys[24] < high).toBe(true);
    }
  });
});

describe("isOrderKey", () => {
  it.each([
    ["a0", true],
    ["a0V", true],
    ["Zz", true],
    ["", false],
    ["a", false],
    ["a0V0", false],
    ["b0", false],
    [`A${"0".repeat(26)}`, false],
    ["a-", false],
    ["1", false],
  ])("%s is %s", (key, valid) => {
    expect(isOrderKey(key)).toBe(valid);
  });
});

describe("compareOrderKeys", () => {
  it("sorts by code unit, so uppercase heads come before lowercase ones", () => {
    expect(["a1", "Zz", "a0V", "a0"].sort(compareOrderKeys)).toEqual(["Zz", "a0", "a0V", "a1"]);
    expect(compareOrderKeys("a0", "a0")).toBe(0);
  });
});
