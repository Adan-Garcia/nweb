import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { createBranch, createFlight, createWing } from "@/lib/hierarchy/entity-storage";
import { createTwig, listTwigs } from "@/lib/twigs/twig-storage";

import type { TwigFormValues } from "./calendar-shared";
import { useCalendarTwigs } from "./use-calendar-twigs";

const STORES = ["twigs", "wings", "flights", "branches", "nests"] as const;

async function seedBranch() {
  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });

  return createBranch({ flightId: flight.id, name: "Physics" });
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
});

async function mount() {
  const hook = renderHook(() => useCalendarTwigs());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe("useCalendarTwigs", () => {
  it("loads the stored tasks and the workspace they belong to", async () => {
    const branch = await seedBranch();
    await createTwig({ branchId: branch.id, title: "Stored", dueDate: "2026-05-05" });

    const { result } = await mount();

    expect(result.current.twigs.map((twig) => twig.title)).toEqual(["Stored"]);
    expect(result.current.snapshot.branches.map((row) => row.name)).toEqual(["Physics"]);
  });

  it("starts empty rather than inventing sample tasks", async () => {
    const { result } = await mount();

    expect(result.current.twigs).toEqual([]);
  });

  it("creates a task, trimming the text the form collected", async () => {
    const branch = await seedBranch();
    const { result } = await mount();

    const form: TwigFormValues = {
      title: "  Study group  ",
      date: "2026-05-05",
      time: " 4:00 PM ",
      branchId: branch.id,
      kind: "project",
      status: "incomplete",
    };

    await act(async () => {
      await result.current.saveTwig(form, null);
    });

    expect(result.current.twigs).toHaveLength(1);
    expect(result.current.twigs[0]).toMatchObject({
      title: "Study group",
      dueDate: "2026-05-05",
      dueTime: "4:00 PM",
      branchId: branch.id,
      kind: "project",
    });
  });

  it("updates the task being edited instead of adding another", async () => {
    const branch = await seedBranch();
    const existing = await createTwig({ branchId: branch.id, title: "Before" });
    const { result } = await mount();

    await act(async () => {
      await result.current.saveTwig(
        {
          title: "After",
          date: "2026-06-06",
          time: "8:00 AM",
          branchId: branch.id,
          kind: "exam",
          status: "complete",
        },
        existing.id,
      );
    });

    expect(result.current.twigs).toHaveLength(1);
    expect(result.current.twigs[0]).toMatchObject({
      id: existing.id,
      title: "After",
      status: "complete",
    });
  });

  it("changes a task's status", async () => {
    const branch = await seedBranch();
    const twig = await createTwig({ branchId: branch.id, title: "Lab" });
    const { result } = await mount();

    await act(async () => {
      await result.current.setTwigStatus(twig.id, "inprogress");
    });

    expect(result.current.twigs[0].status).toBe("inprogress");
  });

  it("deletes a task only once it is confirmed", async () => {
    const branch = await seedBranch();
    const twig = await createTwig({ branchId: branch.id, title: "Lab" });
    const { result } = await mount();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => {
      await result.current.deleteTwig(twig);
    });

    expect(confirm).toHaveBeenCalledWith('Delete "Lab"?');
    expect(result.current.twigs).toHaveLength(1);

    confirm.mockReturnValue(true);
    await act(async () => {
      await result.current.deleteTwig(twig);
    });

    expect(result.current.twigs).toEqual([]);
    // Tombstoned, not removed, so a future sync can tell it was deleted here.
    const database = await getNotesDb();
    expect((await database.get("twigs", twig.id))?.deletedAt).toEqual(expect.any(Number));
    expect(await listTwigs()).toEqual([]);
  });

  it("loads nothing while the workspace is locked, instead of failing the page", async () => {
    const branch = await seedBranch();
    await createTwig({ branchId: branch.id, title: "Problem set" });

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    setActiveCipher(createAesGcmCipher(key, "test-key"));
    await createTwig({ branchId: branch.id, title: "Sealed task" });
    resetActiveCipher();

    const { result } = renderHook(() => useCalendarTwigs());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.twigs).toEqual([]);
  });
});
