import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { columnId } from "@/lib/board";
import { createBranch, createFlight, createWing } from "@/lib/entity-storage";
import { getNotesDb } from "@/lib/notes-db";
import { createTwig, listTwigs } from "@/lib/twig-storage";

import { useBoard } from "./use-board";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

let branchId = "";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));

  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  branchId = (await createBranch({ flightId: flight.id, name: "Biology" })).id;
});

// Minimal stand-ins for dnd-kit's large event types; the hook reads only the ids.
const dragStart = (id: string) => ({ active: { id } }) as DragStartEvent;
const dragEnd = (id: string, overId: string | null) =>
  ({ active: { id }, over: overId ? { id: overId } : null }) as DragEndEvent;

async function mount() {
  const hook = renderHook(() => useBoard());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

const titlesIn = (
  board: ReturnType<typeof useBoard>,
  status: "incomplete" | "inprogress" | "complete",
) => board.columns.find((column) => column.status === status)?.twigs.map((twig) => twig.title);

describe("useBoard", () => {
  it("moves a card into another column, which is what changes its status", async () => {
    const twig = await createTwig({ branchId, title: "Lab report" });
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDragEnd(dragEnd(twig.id, columnId("inprogress")));
    });

    expect(titlesIn(result.current, "incomplete")).toEqual([]);
    expect(titlesIn(result.current, "inprogress")).toEqual(["Lab report"]);

    const stored = (await listTwigs()).find((item) => item.id === twig.id);
    expect(stored?.status).toBe("inprogress");
  });

  it("drops onto a card in another column, taking that card's place", async () => {
    const moving = await createTwig({ branchId, title: "Moving" });
    const target = await createTwig({ branchId, title: "Target", status: "complete" });
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDragEnd(dragEnd(moving.id, target.id));
    });

    expect(titlesIn(result.current, "complete")).toEqual(["Moving", "Target"]);
  });

  it("reorders inside one column and writes the new order", async () => {
    await createTwig({ branchId, title: "First" });
    const second = await createTwig({ branchId, title: "Second" });
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDragEnd(dragEnd(second.id, result.current.columns[0].twigs[0].id));
    });

    expect(titlesIn(result.current, "incomplete")).toEqual(["Second", "First"]);
    await waitFor(async () => {
      expect((await listTwigs()).map((twig) => twig.title)).toEqual(["Second", "First"]);
    });
  });

  it("does nothing when a card is dropped on nothing, or back on itself", async () => {
    const twig = await createTwig({ branchId, title: "Stays" });
    const { result } = await mount();

    await act(async () => {
      await result.current.handleDragEnd(dragEnd(twig.id, null));
      await result.current.handleDragEnd(dragEnd(twig.id, twig.id));
    });

    expect(titlesIn(result.current, "incomplete")).toEqual(["Stays"]);
    expect((await listTwigs())[0].updatedAt).toBe(twig.updatedAt);
  });

  it("tracks which card is being dragged, and forgets it on drop or cancel", async () => {
    const twig = await createTwig({ branchId, title: "Dragged" });
    const { result } = await mount();

    act(() => {
      result.current.handleDragStart(dragStart(twig.id));
    });
    expect(result.current.activeTwig?.title).toBe("Dragged");

    act(() => {
      result.current.handleDragCancel();
    });
    expect(result.current.activeTwig).toBeNull();
  });

  it("keeps the card where it was dropped while the write is still going", async () => {
    const twig = await createTwig({ branchId, title: "Optimistic" });
    const { result } = await mount();

    // Not awaited: this is the frame between the drop and IndexedDB coming back.
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.handleDragEnd(dragEnd(twig.id, columnId("complete")));
    });

    expect(titlesIn(result.current, "complete")).toEqual(["Optimistic"]);

    await act(async () => {
      await pending;
    });
    expect(titlesIn(result.current, "complete")).toEqual(["Optimistic"]);
  });
});
