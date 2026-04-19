import { useEffect } from "react"
import { EditorContent, useEditor as useTiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

export function LinearNotesEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const editor = useTiptapEditor({
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap notes-linear-editor",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    if (editor.getHTML() !== value) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  return (
    <section className="notes-editor-shell">
      <EditorContent editor={editor} />
    </section>
  )
}