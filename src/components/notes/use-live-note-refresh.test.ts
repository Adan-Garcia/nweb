import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChangedRow } from "@/lib/sync/run-sync";

const sync = vi.hoisted(() => ({
  listeners: new Set<(changed: ChangedRow[]) => void>(),
}));

vi.mock("@/lib/sync/sync-service", () => ({
  subscribeToSyncChanges: (listener: (changed: ChangedRow[]) => void) => {
    sync.listeners.add(listener);

    return () => {
      sync.listeners.delete(listener);
    };
  },
}));

import { useLiveNoteRefresh } from "./use-live-note-refresh";

/** Only the refs this hook reads, as the session hands them over. */
function refs(pending: { linear?: number | null; spatial?: number | null } = {}) {
  const activeDocumentIdRef: { current: string | null } = { current: "note-1" };

  return {
    activeDocumentIdRef,
    pendingLinearEditAtRef: { current: pending.linear ?? null },
    pendingSpatialSceneVersionRef: { current: pending.spatial ?? null },
  };
}

function mount(sessionRefs = refs()) {
  const options = {
    activeCreatedMode: "linear" as const,
    hydrateDocument: vi.fn(() => Promise.resolve()),
    refreshDirectoryEntries: vi.fn(() => Promise.resolve()),
    refreshSnapshot: vi.fn(() => Promise.resolve()),
  };
  const hook = renderHook(() =>
    useLiveNoteRefresh({
      ...options,
      refs: sessionRefs,
    }),
  );

  return { ...options, ...hook, sessionRefs };
}

const emit = (changed: ChangedRow[]) => {
  for (const listener of sync.listeners) {
    listener(changed);
  }
};

beforeEach(() => {
  sync.listeners.clear();
});

describe("useLiveNoteRefresh", () => {
  it("reloads the open note when somebody else's edit to it arrives", () => {
    const { hydrateDocument, refreshDirectoryEntries, refreshSnapshot } = mount();

    emit([{ store: "notes-documents", id: "note-1" }]);

    expect(hydrateDocument).toHaveBeenCalledWith("note-1", "linear");
    expect(refreshDirectoryEntries).toHaveBeenCalled();
    expect(refreshSnapshot).toHaveBeenCalled();
  });

  it("re-reads the lists but leaves the open note alone for a change elsewhere", () => {
    const { hydrateDocument, refreshDirectoryEntries } = mount();

    emit([
      { store: "notes-documents", id: "another-note" },
      { store: "notes-directory", id: "note-1" },
    ]);

    expect(hydrateDocument).not.toHaveBeenCalled();
    expect(refreshDirectoryEntries).toHaveBeenCalled();
  });

  it("never reloads over typing that has not been saved yet", () => {
    const linear = mount(refs({ linear: 5 }));

    emit([{ store: "notes-documents", id: "note-1" }]);
    expect(linear.hydrateDocument).not.toHaveBeenCalled();
    linear.unmount();

    const spatial = mount(refs({ spatial: 3 }));

    emit([{ store: "notes-documents", id: "note-1" }]);
    expect(spatial.hydrateDocument).not.toHaveBeenCalled();
  });

  it("does nothing with no note open, and stops listening when unmounted", () => {
    const empty = refs();

    empty.activeDocumentIdRef.current = null;

    const { hydrateDocument, unmount } = mount(empty);

    emit([{ store: "notes-documents", id: "note-1" }]);
    expect(hydrateDocument).not.toHaveBeenCalled();

    unmount();
    expect(sync.listeners.size).toBe(0);
  });
});
