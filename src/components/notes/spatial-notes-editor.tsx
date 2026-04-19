import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types"
import type { RefObject } from "react"

import type { NotesSpatialInitialData } from "@/components/notes/types"

export function SpatialNotesEditor({
  isDark,
  hostRef,
  initialData,
  onChange,
  onPaste,
}: {
  isDark: boolean
  hostRef: RefObject<HTMLDivElement | null>
  initialData: NotesSpatialInitialData
  onChange: NonNullable<ExcalidrawProps["onChange"]>
  onPaste: NonNullable<ExcalidrawProps["onPaste"]>
}) {
  return (
    <section className="notes-canvas-shell">
      <div className="notes-canvas-hint hidden">
        
      </div>
      <div className="notes-excalidraw-host" ref={hostRef}>
        <Excalidraw
          theme={isDark ? "dark" : "light"}
          initialData={initialData}
          onChange={onChange}
          onPaste={onPaste}
        />
      </div>
    </section>
  )
}