import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as syncService from "@/lib/sync/sync-service";

import { useBackgroundSync } from "./use-background-sync";

const stop = vi.fn();

function spyOnStart() {
  return vi.spyOn(syncService, "startBackgroundSync").mockReturnValue({ stop });
}

afterEach(() => {
  stop.mockClear();
});

describe("useBackgroundSync", () => {
  it("starts nothing while the workspace cannot be used", () => {
    const start = spyOnStart();

    renderHook(() => useBackgroundSync(false));

    // A locked workspace has no key. Syncing into one would hand it rows it cannot open.
    expect(start).not.toHaveBeenCalled();
  });

  it("starts once the workspace is usable", () => {
    const start = spyOnStart();

    renderHook(() => useBackgroundSync(true));

    expect(start).toHaveBeenCalledWith({ everyMs: undefined });
  });

  it("passes a period through when it is given one", () => {
    const start = spyOnStart();

    renderHook(() => useBackgroundSync(true, 5_000));

    expect(start).toHaveBeenCalledWith({ everyMs: 5_000 });
  });

  it("stops when the shell goes away", () => {
    spyOnStart();

    renderHook(() => useBackgroundSync(true)).unmount();

    expect(stop).toHaveBeenCalled();
  });

  it("stops when the workspace stops being usable", () => {
    spyOnStart();

    const { rerender } = renderHook(({ usable }) => useBackgroundSync(usable), {
      initialProps: { usable: true },
    });

    rerender({ usable: false });

    // Locking the workspace mid-session has to take the loop with it.
    expect(stop).toHaveBeenCalled();
  });
});
