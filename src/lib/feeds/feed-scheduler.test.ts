import { afterEach, describe, expect, it, vi } from "vitest";

import * as refresh from "./feed-refresh";
import { startFeedRefresh } from "./feed-scheduler";

const rest = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}

afterEach(() => {
  setVisibility("visible");
  vi.restoreAllMocks();
});

describe("startFeedRefresh", () => {
  it("checks at once and then on its timer, until stopped", async () => {
    const sweep = vi.spyOn(refresh, "refreshDueFeeds").mockResolvedValue(0);
    const scheduler = startFeedRefresh({ everyMs: 5 });

    await rest(30);
    scheduler.stop();
    const calls = sweep.mock.calls.length;
    await rest(20);

    expect(calls).toBeGreaterThan(1);
    expect(sweep.mock.calls.length).toBe(calls);
  });

  it("keeps going after a sweep that fails", async () => {
    const sweep = vi.spyOn(refresh, "refreshDueFeeds").mockRejectedValue(new Error("offline"));
    const scheduler = startFeedRefresh({ everyMs: 5 });

    await rest(30);
    scheduler.stop();

    expect(sweep.mock.calls.length).toBeGreaterThan(1);
  });

  it("does nothing while hidden, and checks when the tab comes back", async () => {
    const sweep = vi.spyOn(refresh, "refreshDueFeeds").mockResolvedValue(0);
    setVisibility("hidden");
    const scheduler = startFeedRefresh({ everyMs: 5 });

    await rest(20);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sweep).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    scheduler.stop();

    expect(sweep).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed sweep started by the tab coming back", async () => {
    const sweep = vi.spyOn(refresh, "refreshDueFeeds").mockRejectedValue(new Error("offline"));
    setVisibility("hidden");
    const scheduler = startFeedRefresh({ everyMs: 60_000 });

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await rest(5);
    scheduler.stop();

    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("stops cleanly before its first timer is set, and uses a default period", async () => {
    const sweep = vi.spyOn(refresh, "refreshDueFeeds").mockResolvedValue(0);

    startFeedRefresh().stop();
    await rest(5);

    // The first check had already started; nothing is scheduled after it.
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
