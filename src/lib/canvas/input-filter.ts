/**
 * Which pointer does what, decided when it touches down. `docs/canvas.md` ("The input
 * pipeline") has the rules: the pen always inks; a palm resting while the pen is near is
 * ignored; once a pen has been seen, one finger pans unless "draw with finger" is on; two
 * fingers pan and zoom; a mouse inks with its left button, except in stylus-only mode.
 */
export type PointerKind = "pen" | "touch" | "mouse";

export type PointerAction = "tool" | "pan" | "pinch" | "ignore";

export type InputSettings = {
  /** "auto": fingers draw until this device has reported a pen. */
  fingerDraws: boolean | "auto";
  /** Desktop with a pen tablet: the mouse pans and selects, and never inks. */
  stylusOnly: boolean;
};

export type InputState = {
  penSeen: boolean;
  /** When the pen was last down or hovering, in event time (ms). */
  penLastActive: number;
  /** Touch pointers currently down. */
  touches: ReadonlySet<number>;
  /** The finger drawing right now, and when it started, if one is. */
  drawingTouch: { id: number; since: number } | null;
};

export const INITIAL_INPUT_STATE: InputState = {
  penSeen: false,
  penLastActive: -Infinity,
  touches: new Set(),
  drawingTouch: null,
};

/** How long after the pen was near that a touch still counts as a resting palm. */
export const PALM_GRACE_MS = 500;

/** A second finger this soon after the first means a pinch, not a stroke then a tap. */
export const PINCH_WINDOW_MS = 100;

export type PointerDown = {
  pointerId: number;
  pointerType: PointerKind;
  button: number;
  time: number;
};

export type Decision = {
  state: InputState;
  action: PointerAction;
  /** A finger stroke started moments ago was the first half of a pinch: throw it away. */
  cancelStroke: boolean;
};

function fingersDraw(state: InputState, settings: InputSettings): boolean {
  return settings.fingerDraws === "auto" ? !state.penSeen : settings.fingerDraws;
}

export function pointerDown(
  state: InputState,
  event: PointerDown,
  settings: InputSettings,
  toolInks: boolean,
): Decision {
  if (event.pointerType === "pen") {
    return {
      state: { ...state, penSeen: true, penLastActive: event.time },
      action: "tool",
      cancelStroke: false,
    };
  }

  if (event.pointerType === "mouse") {
    const action = event.button === 1 || (settings.stylusOnly && toolInks) ? "pan" : "tool";

    return { state, action: event.button > 1 ? "ignore" : action, cancelStroke: false };
  }

  if (event.time - state.penLastActive < PALM_GRACE_MS) {
    return { state, action: "ignore", cancelStroke: false };
  }

  const touches = new Set(state.touches).add(event.pointerId);
  if (touches.size >= 2) {
    const drawing = state.drawingTouch;

    return {
      state: { ...state, touches, drawingTouch: null },
      action: "pinch",
      cancelStroke: drawing !== null && event.time - drawing.since < PINCH_WINDOW_MS,
    };
  }

  const draws = fingersDraw(state, settings) || !toolInks;

  return {
    state: {
      ...state,
      touches,
      drawingTouch: draws ? { id: event.pointerId, since: event.time } : null,
    },
    action: draws ? "tool" : "pan",
    cancelStroke: false,
  };
}

/** A hovering or moving pen keeps palm rejection armed. */
export function penNear(state: InputState, time: number): InputState {
  return { ...state, penSeen: true, penLastActive: time };
}

export function pointerUp(
  state: InputState,
  event: Pick<PointerDown, "pointerId" | "pointerType" | "time">,
): InputState {
  if (event.pointerType === "pen") {
    return penNear(state, event.time);
  }
  if (event.pointerType === "mouse") {
    return state;
  }

  const touches = new Set(state.touches);
  touches.delete(event.pointerId);
  const stillDrawing = state.drawingTouch !== null && state.drawingTouch.id !== event.pointerId;

  return { ...state, touches, drawingTouch: stillDrawing ? state.drawingTouch : null };
}
