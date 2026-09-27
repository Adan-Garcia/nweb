import { toast } from "sonner";

/**
 * Transient feedback — "saved", "synced", "could not export" — as a toast.
 *
 * Wrapped so a hook can report without importing a UI package, and so there is one place
 * that decides how long a message stays. Anything someone must act on belongs in the page,
 * not here: a toast disappears.
 */
export function notifySuccess(message: string, description?: string): void {
  toast.success(message, { description });
}

export function notifyError(message: string, description?: string): void {
  toast.error(message, { description, duration: 8000 });
}

export function notifyInfo(message: string, description?: string): void {
  toast(message, { description });
}
