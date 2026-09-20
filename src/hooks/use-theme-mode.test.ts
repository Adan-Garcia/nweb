import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useThemeMode } from "./use-theme-mode";

function stubSystemPrefersDark(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: prefersDark });
}

describe("useThemeMode", () => {
  beforeEach(() => stubSystemPrefersDark(false));

  it("honours a saved dark theme", () => {
    window.localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement).toHaveClass("dark");
  });

  it("honours a saved light theme even if the system prefers dark", () => {
    stubSystemPrefersDark(true);
    window.localStorage.setItem("theme", "light");
    expect(renderHook(() => useThemeMode()).result.current.isDark).toBe(false);
  });

  it("falls back to the system preference when nothing is saved", () => {
    stubSystemPrefersDark(true);
    expect(renderHook(() => useThemeMode()).result.current.isDark).toBe(true);
    expect(renderHook(() => useThemeMode()).result.current.isDark).toBe(true);
  });

  it("is light when nothing is saved and the system prefers light", () => {
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("toggles, persists the choice, and updates the root class", () => {
    const { result } = renderHook(() => useThemeMode());

    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
