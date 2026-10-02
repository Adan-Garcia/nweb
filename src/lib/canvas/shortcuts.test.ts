import { describe, expect, it } from "vitest";

import { commandForKey, type KeyPress } from "./shortcuts";

function press(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

describe("commandForKey", () => {
  it("picks tools with single keys", () => {
    expect(commandForKey(press("p"), "lasso")).toEqual({ type: "tool", tool: "pen" });
    expect(commandForKey(press("H"), "pen")).toEqual({ type: "tool", tool: "highlighter" });
    expect(commandForKey(press("s"), "pen")).toEqual({ type: "tool", tool: "shape" });
    expect(commandForKey(press("l"), "pen")).toEqual({ type: "tool", tool: "lasso" });
  });

  it("switches between the two erasers on E", () => {
    expect(commandForKey(press("e"), "pen")).toEqual({ type: "tool", tool: "eraser-stroke" });
    expect(commandForKey(press("e"), "eraser-stroke")).toEqual({
      type: "tool",
      tool: "eraser-pixel",
    });
    expect(commandForKey(press("e"), "eraser-pixel")).toEqual({
      type: "tool",
      tool: "eraser-stroke",
    });
  });

  it("treats Ctrl and Cmd alike for undo, redo, copy and paste", () => {
    expect(commandForKey(press("z", { ctrlKey: true }), "pen")).toEqual({ type: "undo" });
    expect(commandForKey(press("z", { metaKey: true, shiftKey: true }), "pen")).toEqual({
      type: "redo",
    });
    expect(commandForKey(press("y", { ctrlKey: true }), "pen")).toEqual({ type: "redo" });
    expect(commandForKey(press("c", { metaKey: true }), "pen")).toEqual({ type: "copy" });
    expect(commandForKey(press("v", { ctrlKey: true }), "pen")).toEqual({ type: "paste" });
  });

  it("deletes and fits", () => {
    expect(commandForKey(press("Delete"), "lasso")).toEqual({ type: "delete" });
    expect(commandForKey(press("Backspace"), "lasso")).toEqual({ type: "delete" });
    expect(commandForKey(press("0"), "pen")).toEqual({ type: "fit" });
  });

  it("ignores everything else, and keys held with other modifiers", () => {
    expect(commandForKey(press("q"), "pen")).toBeNull();
    expect(commandForKey(press("p", { ctrlKey: true }), "pen")).toBeNull();
    expect(commandForKey(press("p", { altKey: true }), "pen")).toBeNull();
    expect(commandForKey(press("z", { ctrlKey: true, altKey: true }), "pen")).toBeNull();
  });
});
