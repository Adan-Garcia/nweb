import { BellRing, X } from "lucide-react";

import { useReminderPrompt } from "@/components/shell/use-reminder-prompt";
import { Button } from "@/components/ui/button";

/**
 * A one-time offer to turn on reminders, in the corner of the workspace. Turning them on is
 * the browser's own permission prompt; "Not now" is remembered, and Settings → Reminders
 * stays the place to change either answer later.
 */
export function ReminderPrompt() {
  const prompt = useReminderPrompt();

  if (!prompt.isShown) {
    return null;
  }

  return (
    <section
      aria-label="Turn on reminders"
      className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl md:inset-x-auto md:right-6 md:bottom-6 md:w-80"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-primary">
          <BellRing className="size-4" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-heading">Get reminders?</h2>
          <p className="text-caption text-muted-foreground">
            This device can be told when a task is nearly due. The reminder says when, not what —
            titles stay encrypted.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          className="-mt-1 -mr-1"
          onClick={prompt.dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={prompt.dismiss}>
          Not now
        </Button>
        <Button
          size="sm"
          disabled={prompt.isWorking}
          onClick={() => {
            void prompt.enable();
          }}
        >
          Turn on
        </Button>
      </div>
    </section>
  );
}
