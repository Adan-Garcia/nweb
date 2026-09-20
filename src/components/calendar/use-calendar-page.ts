import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  dateKeyToDate,
  eventFormSchema,
  formatDateKey,
  type EventFormValues,
} from "@/components/calendar/calendar-shared";
import {
  buildMonthCells,
  buildWeekDates,
  filterVisibleEvents,
  formatMonthLabel,
  formatWeekLabel,
  groupEventsByDate,
  listEventClasses,
  scopeEventsToView,
  startOfDay,
  startOfMonth,
  type CalendarViewMode,
  type EventTab,
} from "@/components/calendar/calendar-views";
import { useCalendarEvents } from "@/components/calendar/use-calendar-events";
import { EVENT_COLOR_OPTIONS, type CalendarEvent } from "@/lib/calendar-event";

const DEFAULT_EVENT_TIME = "9:00 AM";

/** State and handlers behind the calendar page. */
export function useCalendarPage() {
  const { calendarEvents, setEventStatus, saveEvent, deleteEvent } =
    useCalendarEvents();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [focusedDate, setFocusedDate] = useState(startOfDay(today));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [eventTab, setEventTab] = useState<EventTab>("active");
  const [isEventOverlayOpen, setIsEventOverlayOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      date: formatDateKey(today),
      time: DEFAULT_EVENT_TIME,
      color: EVENT_COLOR_OPTIONS[0],
      status: "incomplete",
    },
  });

  const monthCells = useMemo(() => buildMonthCells(currentMonth), [currentMonth]);
  const weekDates = useMemo(() => buildWeekDates(focusedDate), [focusedDate]);
  const eventsByDate = useMemo(
    () => groupEventsByDate(calendarEvents),
    [calendarEvents],
  );
  const monthLabel = formatMonthLabel(currentMonth);
  const weekLabel = useMemo(() => formatWeekLabel(weekDates), [weekDates]);

  const viewScopedEvents = useMemo(
    () =>
      scopeEventsToView({
        events: calendarEvents,
        viewMode,
        currentMonth,
        weekDates,
      }),
    [calendarEvents, currentMonth, viewMode, weekDates],
  );

  const filteredEvents = useMemo(
    () =>
      filterVisibleEvents({
        events: viewScopedEvents,
        selectedDateKey,
        searchTerm,
        classFilter: selectedClassFilter,
        eventTab,
      }),
    [eventTab, searchTerm, selectedClassFilter, selectedDateKey, viewScopedEvents],
  );

  const eventClasses = useMemo(
    () => listEventClasses(viewScopedEvents),
    [viewScopedEvents],
  );

  const focusDate = (date: Date) => {
    setFocusedDate(startOfDay(date));
    setCurrentMonth(startOfMonth(date));
  };

  const goToToday = () => {
    focusDate(today);
    setSelectedDateKey(null);
  };

  const shiftView = (direction: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentMonth(
        (month) => new Date(month.getFullYear(), month.getMonth() + direction, 1),
      );
      return;
    }

    const next = new Date(focusedDate);
    next.setDate(next.getDate() + direction * 7);
    setFocusedDate(next);
    setCurrentMonth(startOfMonth(next));
  };

  const selectDate = (date: Date) => {
    setSelectedDateKey(formatDateKey(date));
    focusDate(date);
  };

  const closeEventOverlay = () => {
    setIsEventOverlayOpen(false);
    setEditingEventId(null);
  };

  const openAddEventOverlay = (defaultDate?: string | null) => {
    setEditingEventId(null);
    form.reset({
      title: "",
      date: defaultDate ?? selectedDateKey ?? formatDateKey(today),
      time: DEFAULT_EVENT_TIME,
      color: EVENT_COLOR_OPTIONS[0],
      status: "incomplete",
    });
    setIsEventOverlayOpen(true);
  };

  const openEditEventOverlay = (eventToEdit: CalendarEvent) => {
    setEditingEventId(eventToEdit.id);
    form.reset({
      title: eventToEdit.title,
      date: eventToEdit.date,
      time: eventToEdit.time,
      color: eventToEdit.color,
      status: eventToEdit.status,
    });
    setIsEventOverlayOpen(true);
  };

  const submitEvent = (values: EventFormValues) => {
    const saved = saveEvent(values, editingEventId);

    setSelectedDateKey(saved.date);
    focusDate(dateKeyToDate(saved.date));
    closeEventOverlay();
  };

  useEffect(() => {
    if (!isEventOverlayOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEventOverlayOpen(false);
        setEditingEventId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEventOverlayOpen]);

  return {
    today,
    currentMonth,
    selectedDateKey,
    clearDayFilter: () => setSelectedDateKey(null),
    viewMode,
    setViewMode,
    eventTab,
    setEventTab,
    searchTerm,
    setSearchTerm,
    selectedClassFilter,
    setSelectedClassFilter,
    monthLabel,
    weekLabel,
    visibleDates: viewMode === "month" ? monthCells : weekDates,
    eventsByDate,
    eventClasses,
    filteredEvents,
    setEventStatus,
    deleteEvent,
    goPrevious: () => shiftView(-1),
    goNext: () => shiftView(1),
    goToToday,
    selectDate,
    editor: {
      isOpen: isEventOverlayOpen,
      editingEventId,
      form,
      colorOptions: EVENT_COLOR_OPTIONS,
      openAdd: openAddEventOverlay,
      openEdit: openEditEventOverlay,
      submit: submitEvent,
      close: closeEventOverlay,
    },
  };
}
