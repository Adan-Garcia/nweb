import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { INITIAL_EVENTS, type EventFormValues } from "./calendar-shared"
import { useCalendarEvents } from "./use-calendar-events"

const STORAGE_KEY = "cuervo-calendar-events-v1"

const form: EventFormValues = {
  title: "  Study group  ",
  date: "2026-05-05",
  time: " 4:00 PM ",
  color: "Physics",
  status: "incomplete",
}

describe("useCalendarEvents", () => {
  it("starts from the seed events when nothing is stored, and persists them", () => {
    const { result } = renderHook(() => useCalendarEvents())
    expect(result.current.calendarEvents).toEqual(INITIAL_EVENTS)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual(INITIAL_EVENTS)
  })

  it("loads previously stored events", () => {
    const stored = [{ ...INITIAL_EVENTS[0], id: 42, title: "Stored" }]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    const { result } = renderHook(() => useCalendarEvents())

    expect(result.current.calendarEvents).toEqual(stored)
  })

  it("adds a new event with the next id, trimming text fields, and persists it", () => {
    const { result } = renderHook(() => useCalendarEvents())
    const maxId = Math.max(...INITIAL_EVENTS.map((item) => item.id))
    let returned: EventFormValues | undefined

    act(() => {
      returned = result.current.saveEvent(form, null)
    })

    expect(returned).toMatchObject({ title: "Study group", time: "4:00 PM" })
    const added = result.current.calendarEvents.at(-1)
    expect(added).toMatchObject({ id: maxId + 1, title: "Study group", time: "4:00 PM", color: "Physics" })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(INITIAL_EVENTS.length + 1)
  })

  it("edits an existing event in place", () => {
    const { result } = renderHook(() => useCalendarEvents())
    const target = INITIAL_EVENTS[1]

    act(() => {
      result.current.saveEvent({ ...form, title: "Renamed" }, target.id)
    })

    expect(result.current.calendarEvents).toHaveLength(INITIAL_EVENTS.length)
    expect(result.current.calendarEvents.find((item) => item.id === target.id)?.title).toBe("Renamed")
    expect(result.current.calendarEvents.find((item) => item.id === INITIAL_EVENTS[0].id)).toEqual(INITIAL_EVENTS[0])
  })

  it("changes only the targeted event's status", () => {
    const { result } = renderHook(() => useCalendarEvents())

    act(() => result.current.setEventStatus(INITIAL_EVENTS[0].id, "complete"))

    expect(result.current.calendarEvents[0].status).toBe("complete")
    expect(result.current.calendarEvents[1]).toEqual(INITIAL_EVENTS[1])
  })

  it("deletes an event only after confirmation", () => {
    const { result } = renderHook(() => useCalendarEvents())
    const target = INITIAL_EVENTS[0]
    const confirm = vi.spyOn(window, "confirm")

    confirm.mockReturnValueOnce(false)
    act(() => result.current.deleteEvent(target))
    expect(result.current.calendarEvents).toHaveLength(INITIAL_EVENTS.length)

    confirm.mockReturnValueOnce(true)
    act(() => result.current.deleteEvent(target))
    expect(confirm).toHaveBeenLastCalledWith(`Delete "${target.title}"?`)
    expect(result.current.calendarEvents.some((item) => item.id === target.id)).toBe(false)
  })
})
