import type { ApiSession } from "./client";

/**
 * The session this device currently holds, in memory and nowhere else.
 *
 * A module-level value rather than React state, because the things that need it are not all
 * components: a background sync loop needs it, and so does the settings screen. It is
 * exactly the "shared mutable, non-rendering state" `CLAUDE.md` §2.4 describes, and it is
 * deliberately not persisted — a token is a credential, and writing one to IndexedDB would
 * leave a working one on disk beside the ciphertext it is meant to be separate from.
 *
 * It follows that signing out and closing the tab are the same thing as far as the server
 * is concerned, which is the behaviour a local-first app should have anyway.
 */
let current: ApiSession | null = null;

const listeners = new Set<() => void>();

export function getApiSession(): ApiSession | null {
  return current;
}

export function setApiSession(session: ApiSession | null): void {
  current = session;

  for (const listener of listeners) {
    listener();
  }
}

/** Notifies on every change. Returns the function that stops it, as `useSyncExternalStore` wants. */
export function subscribeToApiSession(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
