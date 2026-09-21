import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotesDirectoryEntry } from "@/components/notes/types";
import { createBranch, createFlight, createNest, createWing } from "@/lib/entity-storage";
import { getNotesDb } from "@/lib/notes-db";
import { loadWorkspaceSnapshot } from "@/lib/workspace-storage";

import { selectionForEntry } from "./location-hierarchy";
import { useNotesLocationPicker } from "./use-notes-location-picker";

const makeEntry = (
  id: string,
  feather: string,
  branchId: string,
  nestIds: string[],
): NotesDirectoryEntry => ({
  id,
  branchId,
  nestIds,
  feather,
  createdMode: "linear",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
});

/** Two wings with a full path each, so a cascade has somewhere else to go. */
async function seedWorkspace() {
  const home = await createWing("Home");
  const fall = await createFlight({ wingId: home.id, name: "Fall 2026" });
  const math = await createBranch({ flightId: fall.id, name: "Math" });
  const unit1 = await createNest({ branchId: math.id, name: "Unit 1" });

  const work = await createWing("Work");
  const q1 = await createFlight({ wingId: work.id, name: "Q1 2026" });
  const ops = await createBranch({ flightId: q1.id, name: "Ops" });
  const runbooks = await createNest({ branchId: ops.id, name: "Runbooks" });

  return { home, fall, math, unit1, work, q1, ops, runbooks };
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
    database.clear("nests"),
  ]);
});

async function setup(overrides: { activeDocumentId?: string | null } = {}) {
  const seeded = await seedWorkspace();
  const snapshot = await loadWorkspaceSnapshot();

  const entries = [
    makeEntry("id-A", "Notes A", seeded.math.id, [seeded.unit1.id]),
    makeEntry("id-B", "Notes B", seeded.math.id, [seeded.unit1.id]),
    makeEntry("id-Oncall", "Oncall", seeded.ops.id, [seeded.runbooks.id]),
  ];

  const createNoteAt = vi.fn(async () => {});
  const openDocumentById = vi.fn(async () => {});
  const refreshSnapshot = vi.fn(async () => {
    const next = await loadWorkspaceSnapshot();
    hook.rerender({ ...options, snapshot: next });
    return next;
  });

  const options = {
    mode: "linear" as const,
    snapshot,
    refreshSnapshot,
    directoryEntries: entries,
    activeDocumentId: "id-A" as string | null,
    activeSelection: selectionForEntry(snapshot, entries[0]),
    createNoteAt,
    openDocumentById,
    ...overrides,
  };

  const hook = renderHook((props: typeof options) => useNotesLocationPicker(props), {
    initialProps: options,
  });

  return { ...hook, options, seeded, snapshot, entries, createNoteAt, openDocumentById };
}

describe("useNotesLocationPicker: path and options", () => {
  it("starts from the active note and summarizes its path", async () => {
    const { result, seeded } = await setup();

    expect(result.current.draftSelection).toMatchObject({
      wingId: seeded.home.id,
      branchId: seeded.math.id,
      featherId: "id-A",
    });
    expect(result.current.selectedLocationSummary).toBe(
      "Home / Fall 2026 / Math / Unit 1 / Notes A",
    );
  });

  it("lists the options for every level, narrowed to the draft's parents", async () => {
    const { result, seeded } = await setup();
    const names = (segment: "wing" | "flight" | "branch" | "nest" | "feather") =>
      result.current.segmentOptions[segment].map((option) => option.name);

    expect(names("wing")).toEqual(["Home", "Work"]);
    expect(names("flight")).toEqual(["Fall 2026"]);
    expect(names("branch")).toEqual(["Math"]);
    expect(names("nest")).toEqual(["Unit 1", "Unfiled"]);
    expect(names("feather")).toEqual(["Notes A", "Notes B"]);
    expect(result.current.segmentOptions.wing[0].id).toBe(seeded.home.id);
  });

  it("restarts the draft when the active note changes", async () => {
    const { result, rerender, options, snapshot, entries, seeded } = await setup();

    act(() => result.current.selectSegmentValue("wing", seeded.work.id));
    expect(result.current.draftSelection.wingId).toBe(seeded.work.id);

    rerender({ ...options, activeSelection: selectionForEntry(snapshot, entries[1]) });

    expect(result.current.draftSelection.featherId).toBe("id-B");
  });
});

describe("useNotesLocationPicker: choosing a segment", () => {
  it("changes a parent level and cascades to valid children without opening anything", async () => {
    const { result, openDocumentById, seeded } = await setup();

    act(() => result.current.selectSegmentValue("wing", seeded.work.id));

    expect(result.current.draftSelection).toEqual({
      wingId: seeded.work.id,
      flightId: seeded.q1.id,
      branchId: seeded.ops.id,
      nestId: seeded.runbooks.id,
      featherId: "id-Oncall",
    });
    expect(result.current.createNote.isOpen).toBe(false);
    expect(openDocumentById).not.toHaveBeenCalled();
  });

  it("opens an existing note when a different one is chosen", async () => {
    const { result, openDocumentById } = await setup();

    act(() => result.current.selectSegmentValue("feather", "id-B"));

    expect(openDocumentById).toHaveBeenCalledWith("id-B");
  });

  it("does nothing more when the note is already open", async () => {
    const { result, openDocumentById } = await setup();

    act(() => result.current.selectSegmentValue("feather", "id-A"));

    expect(openDocumentById).not.toHaveBeenCalled();
  });
});

describe("useNotesLocationPicker: creating a note", () => {
  it("creates the note under the drafted path in the chosen mode, then closes", async () => {
    const { result, createNoteAt, seeded } = await setup();

    act(() => result.current.segmentModal.open("feather", "Note"));
    act(() => result.current.segmentModal.setDraftValue("Brand new"));
    await act(async () => {
      await result.current.segmentModal.submit();
    });

    expect(result.current.createNote.isOpen).toBe(true);
    expect(result.current.createNote.title).toBe("Brand new");

    act(() => result.current.createNote.setMode("spatial"));
    await act(async () => {
      await result.current.createNote.submit();
    });

    expect(createNoteAt).toHaveBeenCalledWith(
      { branchId: seeded.math.id, nestIds: [seeded.unit1.id], feather: "Brand new" },
      "spatial",
    );
    expect(result.current.createNote.isOpen).toBe(false);
    expect(result.current.createNote.isCreating).toBe(false);
  });

  it("files a note under no tag when the draft is on Unfiled", async () => {
    const { result, createNoteAt, seeded } = await setup();

    act(() => result.current.selectSegmentValue("nest", null));
    act(() => result.current.createNote.setTitle("Loose"));
    await act(async () => {
      await result.current.createNote.submit();
    });

    expect(createNoteAt).toHaveBeenCalledWith(
      { branchId: seeded.math.id, nestIds: [], feather: "Loose" },
      "linear",
    );
  });

  it("refuses a blank title rather than creating an untitled note", async () => {
    const { result, createNoteAt } = await setup();

    act(() => result.current.createNote.setTitle("   "));
    await act(async () => {
      await result.current.createNote.submit();
    });

    expect(createNoteAt).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and stops the spinner if creation fails", async () => {
    const { result, createNoteAt } = await setup();
    createNoteAt.mockRejectedValueOnce(new Error("disk full"));
    act(() => result.current.createNote.setIsOpen(true));
    act(() => result.current.createNote.setTitle("Brand new"));

    await act(async () => {
      await expect(result.current.createNote.submit()).rejects.toThrow("disk full");
    });

    expect(result.current.createNote.isOpen).toBe(true);
    expect(result.current.createNote.isCreating).toBe(false);
  });
});

describe("useNotesLocationPicker: adding a level", () => {
  it("opens the dialog empty and clears it on close", async () => {
    const { result } = await setup();

    act(() => result.current.segmentModal.open("nest", "Unit"));
    expect(result.current.segmentModal.state).toEqual({ segment: "nest", label: "Unit" });
    expect(result.current.segmentModal.draftValue).toBe("");

    act(() => result.current.segmentModal.close());
    expect(result.current.segmentModal.state).toBeNull();
  });

  it("writes a real record and selects it, normalizing the whitespace", async () => {
    const { result, seeded } = await setup();

    act(() => result.current.segmentModal.open("branch", "Branch"));
    act(() => result.current.segmentModal.setDraftValue("  Data   Science  "));
    await act(async () => {
      await result.current.segmentModal.submit();
    });

    const snapshot = await loadWorkspaceSnapshot();
    const created = snapshot.branches.find((branch) => branch.name === "Data Science");

    expect(created).toBeDefined();
    expect(created?.flightId).toBe(seeded.fall.id);
    expect(result.current.draftSelection.branchId).toBe(created?.id);
    expect(result.current.segmentModal.state).toBeNull();
  });

  it("adds a wing, a flight and a nest at the level they belong to", async () => {
    const { result, seeded } = await setup();

    const addSegment = async (segment: "wing" | "flight" | "nest", name: string) => {
      act(() => result.current.segmentModal.open(segment, segment));
      act(() => result.current.segmentModal.setDraftValue(name));
      await act(async () => {
        await result.current.segmentModal.submit();
      });
    };

    await addSegment("nest", "Unit 2");
    await addSegment("flight", "Spring 2027");
    await addSegment("wing", "School");

    const snapshot = await loadWorkspaceSnapshot();

    expect(snapshot.nests.find((nest) => nest.name === "Unit 2")?.branchId).toBe(seeded.math.id);
    expect(snapshot.flights.find((flight) => flight.name === "Spring 2027")).toMatchObject({
      wingId: seeded.home.id,
      term: "Spring",
      year: 2027,
    });
    expect(snapshot.wings.map((wing) => wing.name)).toContain("School");
  });

  it("ignores a blank value and does nothing without an open dialog", async () => {
    const { result } = await setup();
    const before = result.current.draftSelection;

    await act(async () => {
      await result.current.segmentModal.submit();
    });
    expect(result.current.draftSelection).toEqual(before);

    act(() => result.current.segmentModal.open("branch", "Branch"));
    act(() => result.current.segmentModal.setDraftValue("   "));
    await act(async () => {
      await result.current.segmentModal.submit();
    });

    expect(result.current.draftSelection).toEqual(before);
    expect(result.current.segmentModal.state).not.toBeNull();
  });

  it("cannot add a level whose parent has not been chosen", async () => {
    const { result } = await setup();

    act(() => result.current.selectSegmentValue("wing", null));
    act(() => result.current.segmentModal.open("flight", "Flight"));
    act(() => result.current.segmentModal.setDraftValue("Orphan"));
    await act(async () => {
      await result.current.segmentModal.submit();
    });

    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot.flights.some((flight) => flight.name === "Orphan")).toBe(false);
  });
});
