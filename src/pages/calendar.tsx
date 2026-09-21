import { CalendarEventListCard } from "@/components/calendar/calendar-event-list-card";
import { CalendarGridCard } from "@/components/calendar/calendar-grid-card";
import { EventOverlay } from "@/components/calendar/event-overlay";
import { useCalendarPage } from "@/components/calendar/use-calendar-page";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";

export function CalendarPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const calendar = useCalendarPage();
  const { editor } = calendar;

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <div>
            <h1 className="text-4xl font-bold">Calendar</h1>
            <p className="text-base text-muted-foreground">
              Plan your classes, tasks, and deadlines in one place.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_2.5fr]">
          <CalendarEventListCard
            snapshot={calendar.snapshot}
            isLoading={calendar.isLoading}
            selectedDateKey={calendar.selectedDateKey}
            viewMode={calendar.viewMode}
            weekLabel={calendar.weekLabel}
            monthLabel={calendar.monthLabel}
            eventTab={calendar.eventTab}
            onEventTabChange={calendar.setEventTab}
            onClearDayFilter={calendar.clearDayFilter}
            searchTerm={calendar.searchTerm}
            onSearchTermChange={calendar.setSearchTerm}
            selectedClassFilter={calendar.selectedClassFilter}
            onSelectedClassFilterChange={calendar.setSelectedClassFilter}
            eventClasses={calendar.eventClasses}
            filteredEvents={calendar.filteredEvents}
            onOpenAddEvent={editor.openAdd}
            onOpenEditEvent={editor.openEdit}
            onDeleteEvent={(event) => {
              void calendar.deleteEvent(event);
            }}
            onSetEventStatus={(twigId, nextStatus) => {
              void calendar.setEventStatus(twigId, nextStatus);
            }}
          />
          <CalendarGridCard
            snapshot={calendar.snapshot}
            viewMode={calendar.viewMode}
            onViewModeChange={calendar.setViewMode}
            monthLabel={calendar.monthLabel}
            weekLabel={calendar.weekLabel}
            onPrevious={calendar.goPrevious}
            onNext={calendar.goNext}
            onToday={calendar.goToToday}
            visibleDates={calendar.visibleDates}
            currentMonth={calendar.currentMonth}
            today={calendar.today}
            selectedDateKey={calendar.selectedDateKey}
            eventsByDate={calendar.eventsByDate}
            onSelectDate={calendar.selectDate}
          />
        </div>
      </div>

      <EventOverlay
        isOpen={editor.isOpen}
        editingTwigId={editor.editingTwigId}
        register={editor.form.register}
        handleSubmit={editor.form.handleSubmit}
        errors={editor.form.formState.errors}
        branchOptions={editor.branchOptions}
        onSubmit={(values) => {
          void editor.submit(values);
        }}
        onClose={editor.close}
      />
    </WorkspaceShell>
  );
}
