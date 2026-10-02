import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readInputSettings, saveInputSettings } from "@/lib/canvas/input-settings-storage";
import { getNotesDb } from "@/lib/db/notes-db";

import { useCanvasInputSettings } from "./use-canvas-input-settings";

beforeEach(async () => {
  await (await getNotesDb()).clear("canvas-settings");
});

describe("useCanvasInputSettings", () => {
  it("reads this device's settings and keeps a change for next time", async () => {
    await saveInputSettings({ fingerDraws: true, stylusOnly: false });
    const { result } = renderHook(() => useCanvasInputSettings());
    await waitFor(() => expect(result.current.settings.fingerDraws).toBe(true));

    act(() => result.current.update({ stylusOnly: true }));

    expect(result.current.settings).toEqual({ fingerDraws: true, stylusOnly: true });
    await waitFor(async () =>
      expect(await readInputSettings()).toEqual({ fingerDraws: true, stylusOnly: true }),
    );
  });

  it("keeps a change for this session when it cannot be stored, and reads nothing once gone", async () => {
    const database = await getNotesDb();
    vi.spyOn(database, "put").mockRejectedValue(new Error("full"));
    const { result, unmount } = renderHook(() => useCanvasInputSettings());

    act(() => result.current.update({ stylusOnly: true }));
    expect(result.current.settings.stylusOnly).toBe(true);
    unmount();
  });
});
