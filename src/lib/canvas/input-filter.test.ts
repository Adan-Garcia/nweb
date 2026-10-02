import { describe, expect, it } from "vitest";

import {
  INITIAL_INPUT_STATE,
  type InputSettings,
  type InputState,
  PALM_GRACE_MS,
  penNear,
  pointerDown,
  pointerUp,
} from "./input-filter";

const auto: InputSettings = { fingerDraws: "auto", stylusOnly: false };

function touch(state: InputState, pointerId: number, time: number, settings = auto, inks = true) {
  return pointerDown(state, { pointerId, pointerType: "touch", button: 0, time }, settings, inks);
}

describe("the pen", () => {
  it("always uses the tool, and is remembered", () => {
    const { state, action } = pointerDown(
      INITIAL_INPUT_STATE,
      { pointerId: 1, pointerType: "pen", button: 0, time: 10 },
      auto,
      true,
    );

    expect(action).toBe("tool");
    expect(state.penSeen).toBe(true);
  });
});

describe("fingers", () => {
  it("draw on a device that has never reported a pen", () => {
    expect(touch(INITIAL_INPUT_STATE, 1, 0).action).toBe("tool");
  });

  it("pan once a pen has been seen, unless drawing with a finger is on", () => {
    const seen = penNear(INITIAL_INPUT_STATE, 0);

    expect(touch(seen, 1, 10_000).action).toBe("pan");
    expect(touch(seen, 1, 10_000, { fingerDraws: true, stylusOnly: false }).action).toBe("tool");
    expect(touch(INITIAL_INPUT_STATE, 1, 0, { fingerDraws: false, stylusOnly: false }).action).toBe(
      "pan",
    );
  });

  it("still select with the lasso after a pen has been seen", () => {
    expect(touch(penNear(INITIAL_INPUT_STATE, 0), 1, 10_000, auto, false).action).toBe("tool");
  });

  it("are ignored as a resting palm while the pen is near", () => {
    const near = penNear(INITIAL_INPUT_STATE, 1000);

    expect(touch(near, 1, 1000 + PALM_GRACE_MS - 1).action).toBe("ignore");
    expect(touch(near, 1, 1000 + PALM_GRACE_MS).action).toBe("pan");
  });

  it("pinch with two, throwing away a stroke the first finger only just began", () => {
    const first = touch(INITIAL_INPUT_STATE, 1, 0);
    const soon = touch(first.state, 2, 50);
    expect(soon).toMatchObject({ action: "pinch", cancelStroke: true });

    const late = touch(first.state, 2, 500);
    expect(late).toMatchObject({ action: "pinch", cancelStroke: false });

    const panning = touch(penNear(INITIAL_INPUT_STATE, -10_000), 1, 0);
    expect(touch(panning.state, 2, 10)).toMatchObject({ action: "pinch", cancelStroke: false });
  });

  it("forget a panning finger when it lifts", () => {
    const panning = touch(penNear(INITIAL_INPUT_STATE, -10_000), 1, 0).state;

    expect(pointerUp(panning, { pointerId: 1, pointerType: "touch", time: 5 })).toMatchObject({
      drawingTouch: null,
    });
  });

  it("are forgotten when lifted", () => {
    const first = touch(INITIAL_INPUT_STATE, 1, 0);
    const second = touch(first.state, 2, 500);
    const lifted = pointerUp(
      pointerUp(second.state, { pointerId: 2, pointerType: "touch", time: 600 }),
      {
        pointerId: 1,
        pointerType: "touch",
        time: 600,
      },
    );

    expect(lifted.touches.size).toBe(0);
    expect(touch(lifted, 3, 700).action).toBe("tool");
    const drawing = touch(INITIAL_INPUT_STATE, 1, 0).state;
    expect(
      pointerUp(drawing, { pointerId: 9, pointerType: "touch", time: 1 }).drawingTouch,
    ).toEqual({
      id: 1,
      since: 0,
    });
  });
});

describe("the mouse", () => {
  const mouse = (button: number, settings = auto, inks = true) =>
    pointerDown(
      INITIAL_INPUT_STATE,
      { pointerId: 1, pointerType: "mouse", button, time: 0 },
      settings,
      inks,
    ).action;

  it("uses the tool with the left button and pans with the middle", () => {
    expect(mouse(0)).toBe("tool");
    expect(mouse(1)).toBe("pan");
    expect(mouse(2)).toBe("ignore");
  });

  it("never inks in stylus-only mode, but still selects", () => {
    const stylusOnly = { fingerDraws: "auto" as const, stylusOnly: true };
    expect(mouse(0, stylusOnly, true)).toBe("pan");
    expect(mouse(0, stylusOnly, false)).toBe("tool");
  });

  it("changes nothing when lifted", () => {
    expect(pointerUp(INITIAL_INPUT_STATE, { pointerId: 1, pointerType: "mouse", time: 5 })).toBe(
      INITIAL_INPUT_STATE,
    );
    expect(
      pointerUp(INITIAL_INPUT_STATE, { pointerId: 1, pointerType: "pen", time: 5 }).penLastActive,
    ).toBe(5);
  });
});
