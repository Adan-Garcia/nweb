import { useMemo, useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import {
  EVENT_COLOR_OPTIONS,
  eventFormSchema,
  formatDateKey,
  INITIAL_EVENTS,
  startOfWeek,
  type CalendarEvent,
  type EventFormValues,
} from "@/components/calendar/calendar-shared"
import { CalendarEventListCard } from "@/components/calendar/calendar-event-list-card"
import { CalendarGridCard } from "@/components/calendar/calendar-grid-card"
import { EventOverlay } from "@/components/calendar/event-overlay"
import { WorkspaceShell } from "@/components/workspace-shell"
import { useThemeMode } from "@/hooks/use-theme-mode"

export function CalendarPage() {
  const { isDark, toggleTheme } = useThemeMode()
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS)
  const today = new Date()
  const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const [currentMonth, setCurrentMonth] = useState(todayMonthStart)
  const [focusedDate, setFocusedDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedClassFilter, setSelectedClassFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"month" | "week">("month")
  const [eventTab, setEventTab] = useState<"active" | "completed">("active")
  const [isEventOverlayOpen, setIsEventOverlayOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<number | null>(null)

  const eventColorOptions = EVENT_COLOR_OPTIONS

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      date: formatDateKey(today),
      time: "9:00 AM",
      color: eventColorOptions[0] ?? "Math",
      status: "incomplete",
    },
  })

  const monthData = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const leadingDays = firstDay.getDay()
    const daysInMonth = lastDay.getDate()

    const cells: Date[] = []

    for (let i = leadingDays; i > 0; i--) {
      cells.push(new Date(year, month, 1 - i))
    }

    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day))
    }

    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (leadingDays + daysInMonth) + 1
      cells.push(new Date(year, month + 1, nextDay))
    }

    return cells
  }, [currentMonth])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    calendarEvents.forEach((event) => {
      const list = map.get(event.date) ?? []
      list.push(event)
      map.set(event.date, list)
    })
    return map
  }, [calendarEvents])

  const monthLabel = currentMonth.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })

  const weekData = useMemo(() => {
    const start = startOfWeek(focusedDate)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [focusedDate])

  const weekLabel = useMemo(() => {
    const start = weekData[0]
    const end = weekData[6]
    const startMonth = start.toLocaleDateString("en-US", { month: "short" })
    const endMonth = end.toLocaleDateString("en-US", { month: "short" })
    const startDay = start.getDate()
    const endDay = end.getDate()
    const year = end.getFullYear()
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}, ${year}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
  }, [weekData])

  const currentMonthEvents = useMemo(() => {
    return calendarEvents.filter((event) => {
      const eventDate = new Date(event.date)
      return (
        eventDate.getMonth() === currentMonth.getMonth() &&
        eventDate.getFullYear() === currentMonth.getFullYear()
      )
    })
  }, [calendarEvents, currentMonth])

  const currentWeekDateKeys = useMemo(() => {
    return new Set(weekData.map((date) => formatDateKey(date)))
  }, [weekData])

  const currentWeekEvents = useMemo(() => {
    return calendarEvents.filter((event) => currentWeekDateKeys.has(event.date))
  }, [calendarEvents, currentWeekDateKeys])

  const viewScopedEvents = viewMode === "week" ? currentWeekEvents : currentMonthEvents

  const filteredEvents = useMemo(() => {
    const dateScopedEvents = selectedDateKey
      ? viewScopedEvents.filter((event) => event.date === selectedDateKey)
      : viewScopedEvents

    const searchAndClassFiltered = dateScopedEvents.filter((event) => {
      const matchesSearch =
        searchTerm.trim().length === 0 ||
        event.title.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesClass = selectedClassFilter === "all" || event.color === selectedClassFilter

      return matchesSearch && matchesClass
    })

    if (eventTab === "completed") {
      return searchAndClassFiltered.filter((event) => event.status === "complete")
    }
    return searchAndClassFiltered.filter((event) => event.status !== "complete")
  }, [eventTab, searchTerm, selectedClassFilter, selectedDateKey, viewScopedEvents])

  const eventClasses = useMemo(() => {
    return Array.from(new Set(viewScopedEvents.map((event) => event.color))).sort((a, b) =>
      a.localeCompare(b),
    )
  }, [viewScopedEvents])

  const goToToday = () => {
    setCurrentMonth(todayMonthStart)
    setFocusedDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    setSelectedDateKey(null)
  }

  const setEventStatus = (eventId: number, nextStatus: CalendarEvent["status"]) => {
    setCalendarEvents((prev) =>
      prev.map((calendarEvent) => {
        if (calendarEvent.id !== eventId) {
          return calendarEvent
        }
        return { ...calendarEvent, status: nextStatus }
      }),
    )
  }

  const openAddEventOverlay = (defaultDate?: string | null) => {
    setEditingEventId(null)
    reset({
      title: "",
      date: defaultDate ?? selectedDateKey ?? formatDateKey(today),
      time: "9:00 AM",
      color: eventColorOptions[0] ?? "Math",
      status: "incomplete",
    })
    setIsEventOverlayOpen(true)
  }

  const openEditEventOverlay = (eventToEdit: CalendarEvent) => {
    setEditingEventId(eventToEdit.id)
    reset({
      title: eventToEdit.title,
      date: eventToEdit.date,
      time: eventToEdit.time,
      color: eventToEdit.color,
      status: eventToEdit.status,
    })
    setIsEventOverlayOpen(true)
  }

  const closeEventOverlay = () => {
    setIsEventOverlayOpen(false)
    setEditingEventId(null)
  }

  const saveEvent = (values: EventFormValues) => {
    const normalized: EventFormValues = {
      ...values,
      title: values.title.trim(),
      time: values.time.trim(),
    }

    if (editingEventId !== null) {
      setCalendarEvents((prev) =>
        prev.map((calendarEvent) => {
          if (calendarEvent.id !== editingEventId) {
            return calendarEvent
          }
          return { ...calendarEvent, ...normalized }
        }),
      )
    } else {
      setCalendarEvents((prev) => {
        const nextId = prev.reduce((maxId, calendarEvent) => Math.max(maxId, calendarEvent.id), 0) + 1
        return [...prev, { id: nextId, ...normalized }]
      })
    }

    const focused = new Date(`${normalized.date}T00:00:00`)
    setSelectedDateKey(normalized.date)
    setFocusedDate(focused)
    setCurrentMonth(new Date(focused.getFullYear(), focused.getMonth(), 1))
    closeEventOverlay()
  }

  const deleteEvent = (eventToDelete: CalendarEvent) => {
    const shouldDelete = window.confirm(`Delete \"${eventToDelete.title}\"?`)
    if (!shouldDelete) {
      return
    }

    setCalendarEvents((prev) => prev.filter((calendarEvent) => calendarEvent.id !== eventToDelete.id))
  }

  useEffect(() => {
    if (!isEventOverlayOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeEventOverlay()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isEventOverlayOpen])

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Workspace overview
            </p>
            <h1 className="text-4xl font-bold">Calendar</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Plan your classes, tasks, and deadlines in one place.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_2.5fr]">
          <CalendarEventListCard
            selectedDateKey={selectedDateKey}
            viewMode={viewMode}
            weekLabel={weekLabel}
            monthLabel={monthLabel}
            eventTab={eventTab}
            onEventTabChange={setEventTab}
            onClearDayFilter={() => setSelectedDateKey(null)}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            selectedClassFilter={selectedClassFilter}
            onSelectedClassFilterChange={setSelectedClassFilter}
            eventClasses={eventClasses}
            filteredEvents={filteredEvents}
            onOpenAddEvent={openAddEventOverlay}
            onOpenEditEvent={openEditEventOverlay}
            onDeleteEvent={deleteEvent}
            onSetEventStatus={setEventStatus}
          />
          <CalendarGridCard
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            monthLabel={monthLabel}
            weekLabel={weekLabel}
            onPrevious={() => {
              if (viewMode === "month") {
                setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
                return
              }
              setFocusedDate((value) => {
                const next = new Date(value)
                next.setDate(next.getDate() - 7)
                setCurrentMonth(new Date(next.getFullYear(), next.getMonth(), 1))
                return next
              })
            }}
            onNext={() => {
              if (viewMode === "month") {
                setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
                return
              }
              setFocusedDate((value) => {
                const next = new Date(value)
                next.setDate(next.getDate() + 7)
                setCurrentMonth(new Date(next.getFullYear(), next.getMonth(), 1))
                return next
              })
            }}
            onToday={goToToday}
            visibleDates={viewMode === "month" ? monthData : weekData}
            currentMonth={currentMonth}
            today={today}
            selectedDateKey={selectedDateKey}
            eventsByDate={eventsByDate}
            onSelectDate={(date) => {
              const dateKey = formatDateKey(date)
              setSelectedDateKey(dateKey)
              setFocusedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
              setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1))
            }}
          />
        </div>
      </div>

      <EventOverlay
        isOpen={isEventOverlayOpen}
        editingEventId={editingEventId}
        register={register}
        handleSubmit={handleSubmit}
        errors={errors}
        eventColorOptions={eventColorOptions}
        onSubmit={saveEvent}
        onClose={closeEventOverlay}
      />
    </WorkspaceShell>
  )
}
