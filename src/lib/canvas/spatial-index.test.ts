import { describe, expect, it } from "vitest";

import { SpatialIndex } from "./spatial-index";

describe("SpatialIndex", () => {
  it("finds only what touches the area asked about", () => {
    const index = new SpatialIndex(100);
    index.insert("near", { x: 10, y: 10, width: 20, height: 20 });
    index.insert("far", { x: 1000, y: 1000, width: 5, height: 5 });
    index.insert("big", { x: -500, y: -500, width: 1000, height: 1000 });

    expect(index.query({ x: 0, y: 0, width: 50, height: 50 })).toEqual(new Set(["near", "big"]));
    expect(index.query({ x: 60, y: 60, width: 10, height: 10 })).toEqual(new Set(["big"]));
    expect(index.size).toBe(3);
  });

  it("moves an element that is inserted again, and forgets a removed one", () => {
    const index = new SpatialIndex();
    index.insert("a", { x: 0, y: 0, width: 1, height: 1 });
    index.insert("a", { x: 900, y: 900, width: 1, height: 1 });

    expect(index.query({ x: 0, y: 0, width: 2, height: 2 }).size).toBe(0);
    expect(index.bounds("a")).toEqual({ x: 900, y: 900, width: 1, height: 1 });

    index.insert("b", { x: 900, y: 900, width: 1, height: 1 });
    index.remove("a");
    expect(index.query({ x: 899, y: 899, width: 5, height: 5 })).toEqual(new Set(["b"]));
    index.remove("b");
    index.remove("never-added");
    expect(index.query({ x: 899, y: 899, width: 5, height: 5 }).size).toBe(0);
    expect(index.size).toBe(0);
  });
});
