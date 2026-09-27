import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePreferencesStore } from "@/stores/use-preferences-store";

import { useAppearance, useSystemPrefersDark } from "./use-appearance";

/** A `matchMedia` whose answer can be changed, and which tells its listeners when it is. */
function stubSystemTheme(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: prefersDark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  window.matchMedia = vi.fn().mockReturnValue(query);

  return {
    set(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
}

describe("useSystemPrefersDark", () => {
  it("follows the operating system, and stops listening when unmounted", () => {
    const system = stubSystemTheme(false);
    const { result, unmount } = renderHook(() => useSystemPrefersDark());

    expect(result.current).toBe(false);
    act(() => system.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(system.listeners.size).toBe(0);
  });

  it("is light where there is no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(renderHook(() => useSystemPrefersDark()).result.current).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe("useAppearance", () => {
  it("resolves system to what the OS says", () => {
    stubSystemTheme(true);
    const { result } = renderHook(() => useAppearance());

    expect(result.current.resolvedTheme).toBe("dark");
    expect(result.current.isDark).toBe(true);
  });

  it("switches to the other of light and dark", () => {
    stubSystemTheme(true);
    const { result } = renderHook(() => useAppearance());

    act(() => result.current.toggleTheme());
    expect(usePreferencesStore.getState().preferences.theme).toBe("light");
    expect(result.current.isDark).toBe(false);

    act(() => result.current.toggleTheme());
    expect(result.current.preferences.theme).toBe("dark");
  });

  it("changes any preference through update", () => {
    stubSystemTheme(false);
    const { result } = renderHook(() => useAppearance());

    act(() => result.current.update({ theme: "oled", accent: "amber" }));

    expect(result.current.resolvedTheme).toBe("oled");
    expect(result.current.preferences.accent).toBe("amber");
  });
});
