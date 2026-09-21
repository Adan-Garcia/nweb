import { useEffect } from "react";
import { EditorContent, useEditor as useTiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Breakpoint matches the original stylesheet (`max-width: 960px`); Tailwind's `max-[N]` is
// exclusive, hence 961. Margins and line-heights on headings/paragraphs use `!` because
// index.css has unlayered element rules (`p { margin: 0 }`, `h1 { margin: 16px 0 }`) that
// would otherwise beat these utilities.
const SHELL_CLASSES =
  "min-h-[calc(100svh_-_16rem)] rounded-[1rem] border border-[color-mix(in_oklab,var(--border)_78%,transparent)] " +
  "[background:radial-gradient(circle_at_12%_12%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_44%),radial-gradient(circle_at_88%_18%,color-mix(in_oklab,var(--muted-foreground)_8%,transparent),transparent_48%),color-mix(in_oklab,var(--card)_86%,var(--background))] " +
  "p-[clamp(1rem,3.2vw,2.3rem)] text-left max-[961px]:min-h-[calc(100svh_-_15.5rem)] max-[961px]:p-4";

const EDITOR_CLASSES =
  "tiptap min-h-[calc(100svh_-_22rem)] text-[1rem] leading-[1.65] text-foreground focus-visible:outline-none " +
  "max-[961px]:min-h-[calc(100svh_-_21rem)] " +
  "[&_p]:mb-[0.7rem]! " +
  "[&_:is(h1,h2,h3)]:mt-0! [&_:is(h1,h2,h3)]:mb-[0.7rem]! [&_:is(h1,h2,h3)]:leading-[1.25]! " +
  "[&_:is(ul,ol)]:mb-[0.85rem] [&_:is(ul,ol)]:pl-[1.2rem]";

export function LinearNotesEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useTiptapEditor({
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: EDITOR_CLASSES,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  return (
    <section className={SHELL_CLASSES}>
      <EditorContent editor={editor} />
    </section>
  );
}
