import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIsMobile } from "./use-mobile"

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width })
}

function stubMatchMedia() {
  const listeners = new Set<() => void>()
  const removeEventListener = vi.fn((_type: string, listener: () => void) => listeners.delete(listener))
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener,
  })
  return { listeners, removeEventListener }
}

describe("useIsMobile", () => {
  afterEach(() => setViewport(1024))

  it("is true below the 768px breakpoint", () => {
    setViewport(500)
    stubMatchMedia()
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })

  it("is false at or above the breakpoint", () => {
    setViewport(768)
    stubMatchMedia()
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })

  it("updates when the media query changes", () => {
    setViewport(1024)
    const { listeners } = stubMatchMedia()
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    setViewport(400)
    act(() => listeners.forEach((listener) => listener()))
    expect(result.current).toBe(true)
  })

  it("stops listening on unmount", () => {
    setViewport(1024)
    const { removeEventListener } = stubMatchMedia()
    renderHook(() => useIsMobile()).unmount()
    expect(removeEventListener).toHaveBeenCalledTimes(1)
  })
})
