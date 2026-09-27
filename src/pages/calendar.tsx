import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { CalendarEventListCard } from "@/components/calendar/calendar-event-list-card";
import { CalendarGridCard } from "@/components/calendar/calendar-grid-card";
import { EventOverlay } from "@/components/calendar/event-overlay";
import { useCalendarPage } from "@/components/calendar/use-calendar-page";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export function CalendarPage() {
  const calendar = useCalendarPage();
  const { editor } = calendar;

  // A small distance before a drag starts, so the buttons on an event still take a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  return (
    <>
      <PageContainer width="wide">
        <PageHeader
          title="Calendar"
          description="Plan your classes, tasks, and deadlines in one place."
          actions={
            <Button
              disabled={calendar.isLoading}
              onClick={() => editor.openAdd(calendar.selectedDateKey)}
            >
              <Plus className="size-4" />
              Add Event
            </Button>
          }
        />

        <DndContext
          sensors={sensors}
          // The dragged card is larger than a day cell and overlaps several at once, so the
          // day under the pointer is the one that counts, not the one it overlaps most.
          collisionDetection={pointerWithin}
          onDragEnd={(event) => {
            void calendar.handleDayDrop(
              String(event.active.id),
              event.over ? String(event.over.id) : null,
            );
          }}
        >
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(18rem,1fr)_2.5fr]">
            {/* The grid comes first on a phone, where the list would push it off the screen. */}
            <CalendarEventListCard
              className="order-2 lg:order-1"
              snapshot={calendar.snapshot}
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
              onOpenEditEvent={editor.openEdit}
              onDeleteEvent={(event) => {
                void calendar.deleteEvent(event);
              }}
              onSetEventStatus={(twigId, nextStatus) => {
                void calendar.setEventStatus(twigId, nextStatus);
              }}
            />
            <CalendarGridCard
              className="order-1 lg:order-2"
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
        </DndContext>
      </PageContainer>

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
    </>
  );
}
