import { CanvasEditor } from "@/components/notes/spatial/canvas-editor";
import type { NotesSpatialInitialData, SpatialSnapshot } from "@/components/notes/types";

type SpatialNotesEditorProps = {
  initialData: NotesSpatialInitialData;
  onChange: (snapshot: SpatialSnapshot) => void;
  optimizeImage: (file: File) => Promise<Blob>;
  isReadOnly?: boolean;
};

/**
 * A spatial note: the canvas, or why it cannot be shown. A drawing this build cannot read
 * is not opened at all, so autosave can never write an empty canvas over it.
 */
export function SpatialNotesEditor({
  initialData,
  onChange,
  optimizeImage,
  isReadOnly = false,
}: SpatialNotesEditorProps) {
  if (initialData.status === "unreadable") {
    return (
      <div
        role="status"
        className="flex min-h-105 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        <p className="m-0 font-medium text-foreground">This drawing can’t be opened here.</p>
        <p className="m-0">
          {initialData.reason === "newer-format"
            ? "It was saved by a newer version of the app. Update this device to open it."
            : "It was saved in a format this version does not read. It has been left as it is."}
        </p>
      </div>
    );
  }

  return (
    <CanvasEditor
      initial={initialData}
      onChange={onChange}
      optimizeImage={optimizeImage}
      isReadOnly={isReadOnly}
    />
  );
}
