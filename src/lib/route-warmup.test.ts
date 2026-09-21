import { afterEach, describe, expect, it, vi } from "vitest";

import { warmRoutes } from "./route-warmup";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

const production = { isProduction: true };

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "requestIdleCallback");
});

/** jsdom has no requestIdleCallback, so each test says which path it is exercising. */
function withIdleCallback() {
  const idle = vi.fn((callback: () => void) => {
    callback();
    return 1;
  });

  (window as IdleWindow).requestIdleCallback = idle;
  return idle;
}

describe("warmRoutes", () => {
  it("fetches every route once the browser is idle", () => {
    withIdleCallback();
    const loaders = [vi.fn(() => Promise.resolve()), vi.fn(() => Promise.resolve())];

    warmRoutes(loaders, production);

    expect(loaders[0]).toHaveBeenCalledOnce();
    expect(loaders[1]).toHaveBeenCalledOnce();
  });

  it("waits for idle rather than competing with the page the user asked for", () => {
    const idle = withIdleCallback();
    warmRoutes([vi.fn(() => Promise.resolve())], production);

    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 5_000 });
  });

  it("falls back to a timer where there is no idle callback", () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());

    warmRoutes([load], production);
    expect(load).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(load).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does nothing in development, where a cached chunk would be yesterday's code", () => {
    withIdleCallback();
    const load = vi.fn(() => Promise.resolve());

    warmRoutes([load], { isProduction: false });

    expect(load).not.toHaveBeenCalled();
  });

  it("spends nobody's data plan on a route they may never open", () => {
    withIdleCallback();
    // jsdom implements no Network Information API, so the property is defined here first.
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    const load = vi.fn(() => Promise.resolve());

    try {
      warmRoutes([load], production);
      expect(load).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "connection");
    }
  });

  it("carries on when a chunk will not load, which is the case it is there for", () => {
    withIdleCallback();
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    const following = vi.fn(() => Promise.resolve());

    expect(() => {
      warmRoutes([failing, following], production);
    }).not.toThrow();
    expect(following).toHaveBeenCalledOnce();
  });
});
