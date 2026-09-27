import { describe, expect, it } from "vitest";

import { moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves an item up and down", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("stops at the ends", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"]);
  });

  it("ignores an index outside the list", () => {
    expect(moveItem(["a", "b"], 4, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });

  it("never changes the list it was given", () => {
    const list = ["a", "b"];

    moveItem(list, 0, 1);

    expect(list).toEqual(["a", "b"]);
  });
});
