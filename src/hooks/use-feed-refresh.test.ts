import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as scheduler from "@/lib/feeds/feed-scheduler";

import { useFeedRefresh } from "./use-feed-refresh";

const stop = vi.fn();

function spyOnStart() {
  return vi.spyOn(scheduler, "startFeedRefresh").mockReturnValue({ stop });
}

afterEach(() => {
  stop.mockClear();
});

describe("useFeedRefresh", () => {
  it("starts nothing while the workspace cannot be used", () => {
    const start = spyOnStart();

    renderHook(() => useFeedRefresh(false));

    // A locked workspace cannot seal the tasks a feed would write.
    expect(start).not.toHaveBeenCalled();
  });

  it("starts once the workspace is usable, with any period it is given", () => {
    const start = spyOnStart();

    renderHook(() => useFeedRefresh(true, 5_000));

    expect(start).toHaveBeenCalledWith({ everyMs: 5_000 });
  });

  it("stops when the shell goes away", () => {
    spyOnStart();

    renderHook(() => useFeedRefresh(true)).unmount();

    expect(stop).toHaveBeenCalled();
  });
});
