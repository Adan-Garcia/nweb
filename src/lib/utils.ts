import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's own font sizes. Without this it reads `text-title`
 * as a colour, and `cn("text-title", "text-muted-foreground")` would drop the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "heading", "body", "caption"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ENTER_ADVANCES = "input:not([type=hidden]):not([disabled]), select:not([disabled])";
const FOCUSABLE =
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/**
 * For a form's `onKeyDown`: Enter in a text box, date, dropdown or checkbox moves on to the
 * next field, as finishing a field means, instead of submitting a half-filled form. The
 * submit button still submits, as does Ctrl or ⌘ with Enter from anywhere.
 */
export function focusNextFieldOnEnter(event: KeyboardEvent, form: HTMLFormElement) {
  const field = event.target;

  if (
    event.key !== "Enter" ||
    event.isComposing ||
    event.shiftKey ||
    event.altKey ||
    !(field instanceof HTMLElement) ||
    !field.matches(ENTER_ADVANCES)
  ) {
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    form.requestSubmit();
    return;
  }

  event.preventDefault();

  const fields = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE));

  fields[fields.indexOf(field) + 1]?.focus();
}
