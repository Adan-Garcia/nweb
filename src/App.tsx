import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { z } from 'zod'
import { create } from 'zustand'
import { FieldError, Input, Label, TextField } from 'react-aria-components'
import { CalendarDays, GripVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Task = {
  id: string
  title: string
}

type DemoStore = {
  tasks: Task[]
  lastActionAt: Date
  moveTask: (activeId: string, overId: string) => void
}

const initialTasks: Task[] = [
  { id: 'task-1', title: 'Wire auth form' },
  { id: 'task-2', title: 'Connect API hooks' },
  { id: 'task-3', title: 'Polish empty states' },
  { id: 'task-4', title: 'Run QA checklist' },
]

const useDemoStore = create<DemoStore>((set) => ({
  tasks: initialTasks,
  lastActionAt: new Date(),
  moveTask: (activeId, overId) => {
    set((state) => {
      const oldIndex = state.tasks.findIndex((task) => task.id === activeId)
      const newIndex = state.tasks.findIndex((task) => task.id === overId)

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return state
      }

      return {
        tasks: arrayMove(state.tasks, oldIndex, newIndex),
        lastActionAt: new Date(),
      }
    })
  },
}))

const displayNameSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(30, 'Use 30 characters or fewer.')

function SortableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-left shadow-sm',
        isDragging && 'opacity-70 ring-2 ring-ring'
      )}
    >
      <span className="text-sm text-card-foreground">{task.title}</span>
      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        aria-label={`Drag ${task.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </li>
  )
}

function App() {
  const [displayName, setDisplayName] = useState('')
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [open, setOpen] = useState(false)

  const tasks = useDemoStore((state) => state.tasks)
  const lastActionAt = useDemoStore((state) => state.lastActionAt)
  const moveTask = useDemoStore((state) => state.moveTask)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const lastUpdatedLabel = useMemo(
    () => formatDistanceToNow(lastActionAt, { addSuffix: true }),
    [lastActionAt]
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) {
      return
    }

    moveTask(String(active.id), String(over.id))
  }

  function validateAndSaveName() {
    const parsed = displayNameSchema.safeParse(displayName)

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Invalid name')
      return
    }

    setFormError('')
    setSubmittedName(parsed.data)
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f3f4f6,#e5e7eb_45%,#d1d5db)] px-4 py-8 text-foreground sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl border bg-background/85 p-5 shadow-xl backdrop-blur sm:p-8">
        <header className="space-y-2 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Integration playground</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">shadcn + React Aria + Radix + dnd-kit</h1>
          <p className="text-sm text-muted-foreground">Zod validates profile input, zustand stores task order, and date-fns formats the latest interaction time.</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="space-y-4 rounded-2xl border bg-card/70 p-4 text-left sm:p-5">
            <h2 className="text-xl font-medium">React Aria + Zod</h2>
            <TextField
              isRequired
              isInvalid={Boolean(formError)}
              value={displayName}
              onChange={setDisplayName}
              className="space-y-2"
            >
              <Label className="text-sm font-medium">Display name</Label>
              <Input
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none ring-0 transition focus:border-ring"
                placeholder="Jane Dev"
              />
              <FieldError className="text-sm text-destructive">{formError}</FieldError>
            </TextField>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={validateAndSaveName}>Save Name</Button>
              <span className="text-sm text-muted-foreground">
                Saved:{' '}
                <strong className="text-foreground">{submittedName ?? 'not set'}</strong>
              </span>
            </div>
          </article>

          <article className="space-y-4 rounded-2xl border bg-card/70 p-4 text-left sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-medium">dnd-kit + zustand</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Updated {lastUpdatedLabel}
              </span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <SortableTask key={task.id} task={task} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </article>
        </section>

        <section className="rounded-2xl border bg-card/70 p-4 text-left sm:p-5">
          <h2 className="mb-3 text-xl font-medium">Radix Dialog + shadcn Button</h2>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button variant="outline">Open project summary</Button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40" />
              <Dialog.Content className="fixed top-1/2 left-1/2 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-5 shadow-2xl">
                <Dialog.Title className="text-lg font-semibold">Today&apos;s sprint focus</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  Use this modal pattern for confirmations, shortcuts, and compact task details.
                </Dialog.Description>
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">Close</Button>
                  </Dialog.Close>
                  <Button onClick={() => setOpen(false)}>Looks good</Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </section>
      </div>
    </main>
  )
}

export default App
