import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { readNotesNavigationMode, writeNotesNavigationMode } from "@/lib/notes-navigation";

import { useNotesNavigation } from "./use-notes-navigation";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useNotesNavigation", () => {
  it("starts on the path bar, which is what the page has always been", () => {
    const { result } = renderHook(() => useNotesNavigation());

    expect(result.current.navigationMode).toBe("path");
  });

  it("starts on the tree when that is what was chosen last time", () => {
    writeNotesNavigationMode("tree");

    const { result } = renderHook(() => useNotesNavigation());

    expect(result.current.navigationMode).toBe("tree");
  });

  it("remembers a change, so the choice outlives the visit", () => {
    const { result } = renderHook(() => useNotesNavigation());

    act(() => {
      result.current.chooseNavigation("tree");
    });

    expect(result.current.navigationMode).toBe("tree");
    expect(readNotesNavigationMode()).toBe("tree");
  });

  it("ignores a stored value that is not one of the two", () => {
    window.localStorage.setItem("cuervo-notes-navigation", "carousel");

    const { result } = renderHook(() => useNotesNavigation());

    expect(result.current.navigationMode).toBe("path");
  });
});
