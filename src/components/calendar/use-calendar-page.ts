import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  dateKeyToDate,
  formatDateKey,
  isDatedTwig,
  twigFormSchema,
  type TwigFormValues,
} from "@/components/calendar/calendar-shared";
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
import type { Twig } from "@/lib/twig-model";
import { branchPath } from "@/lib/workspace-tree";

const DEFAULT_EVENT_TIME = "9:00 AM";

/** State and handlers behind the calendar page. */
export function useCalendarPage() {
  const { twigs, isLoading, snapshot, setTwigStatus, saveTwig, deleteTwig } = useCalendarTwigs();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [focusedDate, setFocusedDate] = useState(startOfDay(today));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [eventTab, setEventTab] = useState<EventTab>("active");
  const [isEventOverlayOpen, setIsEventOverlayOpen] = useState(false);
  const [editingTwigId, setEditingTwigId] = useState<string | null>(null);

  /** Every branch in the workspace, labelled with the flight it belongs to. */
  const branchOptions = useMemo(
    () =>
      snapshot.branches
        .map((branch) => {
          const path = branchPath(snapshot, branch.id);

          return {
            id: branch.id,
            name: branch.name,
            color: branch.color,
            label: path ? `${path.flight.name} / ${branch.name}` : branch.name,
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [snapshot],
  );

  const form = useForm<TwigFormValues>({
    resolver: zodResolver(twigFormSchema),
    defaultValues: {
      title: "",
      date: formatDateKey(today),
      time: DEFAULT_EVENT_TIME,
      branchId: "",
      kind: "homework",
      status: "incomplete",
    },
  });

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

  const eventClasses = useMemo(() => {
    const visibleIds = new Set(listEventBranchIds(viewScopedEvents));

    return branchOptions.filter((branch) => visibleIds.has(branch.id));
  }, [branchOptions, viewScopedEvents]);

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

  const closeEventOverlay = () => {
    setIsEventOverlayOpen(false);
    setEditingTwigId(null);
  };

  const openAddEventOverlay = (defaultDate?: string | null) => {
    setEditingTwigId(null);
    form.reset({
      title: "",
      date: defaultDate ?? selectedDateKey ?? formatDateKey(today),
      time: DEFAULT_EVENT_TIME,
      branchId: branchOptions[0]?.id ?? "",
      kind: "homework",
      status: "incomplete",
    });
    setIsEventOverlayOpen(true);
  };

  const openEditEventOverlay = (twigToEdit: Twig) => {
    setEditingTwigId(twigToEdit.id);
    form.reset({
      title: twigToEdit.title,
      date: twigToEdit.dueDate ?? formatDateKey(today),
      time: twigToEdit.dueTime,
      branchId: twigToEdit.branchId,
      kind: twigToEdit.kind,
      status: twigToEdit.status,
    });
    setIsEventOverlayOpen(true);
  };

  const submitEvent = async (values: TwigFormValues) => {
    const saved = await saveTwig(values, editingTwigId);

    setSelectedDateKey(saved.dueDate);
    focusDate(dateKeyToDate(saved.dueDate));
    closeEventOverlay();
  };

  useEffect(() => {
    if (!isEventOverlayOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEventOverlayOpen(false);
        setEditingTwigId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEventOverlayOpen]);

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
    deleteEvent: deleteTwig,
    goPrevious: () => shiftView(-1),
    goNext: () => shiftView(1),
    goToToday,
    selectDate,
    editor: {
      isOpen: isEventOverlayOpen,
      editingTwigId,
      form,
      branchOptions,
      openAdd: openAddEventOverlay,
      openEdit: openEditEventOverlay,
      submit: submitEvent,
      close: closeEventOverlay,
    },
  };
}
