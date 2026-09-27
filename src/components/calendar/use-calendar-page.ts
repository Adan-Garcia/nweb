import { useMemo, useState } from "react";

import { dateKeyToDate, formatDateKey, isDatedTwig } from "@/components/calendar/calendar-shared";
import {
  buildMonthCells,
  buildWeekDates,
  type CalendarViewMode,
  type EventTab,
  filterVisibleEvents,
  formatMonthLabel,
  formatWeekLabel,
  groupEventsByDate,
  listEventBranchIds,
  scopeEventsToView,
  startOfDay,
  startOfMonth,
} from "@/components/calendar/calendar-views";
import { useCalendarTwigs } from "@/components/calendar/use-calendar-twigs";
import { useTwigEditor } from "@/components/calendar/use-twig-editor";
import { resolveCalendarDrop } from "@/lib/twigs/calendar-drop";

/** State and handlers behind the calendar page. */
export function useCalendarPage() {
  const { twigs, isLoading, snapshot, setTwigStatus, saveTwig, deleteTwig, rescheduleTwig } =
    useCalendarTwigs();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [focusedDate, setFocusedDate] = useState(startOfDay(today));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [eventTab, setEventTab] = useState<EventTab>("active");

  const datedTwigs = useMemo(() => twigs.filter(isDatedTwig), [twigs]);

  const monthCells = useMemo(() => buildMonthCells(currentMonth), [currentMonth]);
  const weekDates = useMemo(() => buildWeekDates(focusedDate), [focusedDate]);
  const eventsByDate = useMemo(() => groupEventsByDate(datedTwigs), [datedTwigs]);
  const monthLabel = formatMonthLabel(currentMonth);
  const weekLabel = useMemo(() => formatWeekLabel(weekDates), [weekDates]);

  const viewScopedEvents = useMemo(
    () =>
      scopeEventsToView({
        events: datedTwigs,
        viewMode,
        currentMonth,
        weekDates,
      }),
    [datedTwigs, currentMonth, viewMode, weekDates],
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

  /** Dropping a task on a day in the grid moves its due date there. */
  const handleDayDrop = async (activeId: string, overId: string | null) => {
    const twig = twigs.find((candidate) => candidate.id === activeId);
    const drop = resolveCalendarDrop({
      activeId,
      overId,
      currentDueDate: twig?.dueDate ?? null,
    });

    if (!drop) {
      return;
    }

    await rescheduleTwig(drop.twigId, drop.dueDate);
    setSelectedDateKey(drop.dueDate);
    focusDate(dateKeyToDate(drop.dueDate));
  };

  const editor = useTwigEditor({
    snapshot,
    saveTwig,
    onSaved: (dateKey) => {
      setSelectedDateKey(dateKey);
      focusDate(dateKeyToDate(dateKey));
    },
  });

  const eventClasses = useMemo(() => {
    const visibleIds = new Set(listEventBranchIds(viewScopedEvents));

    return editor.branchOptions.filter((branch) => visibleIds.has(branch.id));
  }, [editor.branchOptions, viewScopedEvents]);

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
      setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + direction, 1));
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

  return {
    today,
    isLoading,
    snapshot,
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
    setEventStatus: setTwigStatus,
    handleDayDrop,
    deleteEvent: deleteTwig,
    goPrevious: () => shiftView(-1),
    goNext: () => shiftView(1),
    goToToday,
    selectDate,
    editor: {
      ...editor,
      /** The calendar adds on whichever day is selected unless told otherwise. */
      openAdd: (defaultDate?: string | null) =>
        editor.openAdd(defaultDate ?? selectedDateKey ?? formatDateKey(today)),
    },
  };
}
