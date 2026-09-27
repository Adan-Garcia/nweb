import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { createBranch, createFlight, createWing } from "@/lib/hierarchy/entity-storage";
import { createTwigSeries } from "@/lib/twigs/twig-series";
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

function editValues(branchId: string): TwigFormValues {
  return {
    title: "Edited",
    date: "2026-05-04",
    time: "9:00 AM",
    branchId,
    kind: "homework",
    status: "incomplete",
    repeat: "none",
    repeatUntil: "",
    scope: "one",
  };
}

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
      repeat: "none",
      repeatUntil: "",
      scope: "one",
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
          repeat: "none",
          repeatUntil: "",
          scope: "one",
        },
        existing,
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

  it("deletes a task as a tombstone", async () => {
    const branch = await seedBranch();
    const twig = await createTwig({ branchId: branch.id, title: "Lab" });
    const { result } = await mount();

    await act(async () => {
      await result.current.deleteTwig(twig);
    });

    expect(result.current.twigs).toEqual([]);
    // Tombstoned, not removed, so a future sync can tell it was deleted here.
    const database = await getNotesDb();
    expect((await database.get("twigs", twig.id))?.deletedAt).toEqual(expect.any(Number));
    expect(await listTwigs()).toEqual([]);
  });

  it("creates one task per date of a repeating one, tied into a series", async () => {
    const branch = await seedBranch();
    const { result } = await mount();

    await act(async () => {
      await result.current.saveTwig(
        {
          title: "Problem set",
          date: "2026-05-04",
          time: "5:00 PM",
          branchId: branch.id,
          kind: "homework",
          status: "incomplete",
          repeat: "weekly",
          repeatUntil: "2026-05-18",
          scope: "one",
        },
        null,
      );
    });

    const twigs = await listTwigs();

    expect(twigs.map((twig) => twig.dueDate).sort()).toEqual([
      "2026-05-04",
      "2026-05-11",
      "2026-05-18",
    ]);
    expect(new Set(twigs.map((twig) => twig.seriesId)).size).toBe(1);
    expect(twigs[0].seriesId).not.toBeNull();
  });

  it("deletes one occurrence, the ones after it, or the whole series", async () => {
    const branch = await seedBranch();
    const series = await createTwigSeries(
      { branchId: branch.id, title: "Reading", dueDate: "2026-05-04" },
      "daily",
      "2026-05-08",
    );
    const other = await createTwigSeries(
      { branchId: branch.id, title: "Other", dueDate: "2026-05-04" },
      "daily",
      "2026-05-05",
    );
    const { result } = await mount();
    const readingDates = async () =>
      (await listTwigs())
        .filter((twig) => twig.title === "Reading")
        .map((twig) => twig.dueDate)
        .sort();

    await act(() => result.current.deleteTwig(series[1], "one"));
    expect(await readingDates()).toEqual(["2026-05-04", "2026-05-06", "2026-05-07", "2026-05-08"]);

    await act(() => result.current.deleteTwig(series[3], "following"));
    expect(await readingDates()).toEqual(["2026-05-04", "2026-05-06"]);

    await act(() => result.current.deleteTwig(series[0], "all"));
    expect(await readingDates()).toEqual([]);
    // Another series with the same shape is untouched.
    expect(await listTwigs()).toHaveLength(other.length);
  });

  it("deletes only the task itself when it is not part of a series, whatever the scope", async () => {
    const branch = await seedBranch();
    const twig = await createTwig({ branchId: branch.id, title: "Once", dueDate: "2026-05-04" });
    await createTwig({ branchId: branch.id, title: "Kept", dueDate: "2026-05-05" });
    const { result } = await mount();

    await act(() => result.current.deleteTwig(twig, "all"));

    expect((await listTwigs()).map((row) => row.title)).toEqual(["Kept"]);
  });

  it("edits every occurrence of a series, moving each by the same number of days", async () => {
    const branch = await seedBranch();
    const other = await createBranch({ flightId: branch.flightId, name: "Chemistry" });
    const series = await createTwigSeries(
      { branchId: branch.id, title: "Quiz", dueDate: "2026-05-04", dueTime: "9:00 AM" },
      "weekly",
      "2026-05-18",
    );
    const { result } = await mount();

    await act(() =>
      result.current.saveTwig(
        {
          ...editValues(branch.id),
          title: "Weekly quiz",
          date: "2026-05-14",
          time: "1:00 PM",
          branchId: other.id,
          kind: "exam",
          status: "complete",
          scope: "all",
        },
        series[1],
      ),
    );

    const twigs = (await listTwigs()).sort((left, right) =>
      String(left.dueDate).localeCompare(String(right.dueDate)),
    );

    expect(twigs.map((twig) => twig.dueDate)).toEqual(["2026-05-07", "2026-05-14", "2026-05-21"]);
    expect(new Set(twigs.map((twig) => twig.title))).toEqual(new Set(["Weekly quiz"]));
    expect(new Set(twigs.map((twig) => twig.dueTime))).toEqual(new Set(["1:00 PM"]));
    expect(new Set(twigs.map((twig) => twig.branchId))).toEqual(new Set([other.id]));
    expect(new Set(twigs.map((twig) => twig.kind))).toEqual(new Set(["exam"]));
    // Done is each occurrence's own: only the one edited is marked.
    expect(twigs.map((twig) => twig.status)).toEqual(["incomplete", "complete", "incomplete"]);
  });

  it("edits an occurrence and the ones after it, leaving the earlier ones", async () => {
    const branch = await seedBranch();
    const series = await createTwigSeries(
      { branchId: branch.id, title: "Lab", dueDate: "2026-05-04" },
      "weekly",
      "2026-05-18",
    );
    const { result } = await mount();

    await act(() =>
      result.current.saveTwig(
        {
          ...editValues(branch.id),
          title: "Lab (new room)",
          date: "2026-05-11",
          scope: "following",
        },
        series[1],
      ),
    );

    const titles = (await listTwigs())
      .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
      .map((twig) => twig.title);

    expect(titles).toEqual(["Lab", "Lab (new room)", "Lab (new room)"]);
  });

  it("edits one occurrence of a series on its own, and it stays in the series", async () => {
    const branch = await seedBranch();
    const series = await createTwigSeries(
      { branchId: branch.id, title: "Lab", dueDate: "2026-05-04" },
      "weekly",
      "2026-05-18",
    );
    const { result } = await mount();

    await act(() =>
      result.current.saveTwig(
        { ...editValues(branch.id), title: "Lab moved", date: "2026-05-12", scope: "one" },
        series[1],
      ),
    );

    const twigs = await listTwigs();

    expect(twigs.map((twig) => twig.title).sort()).toEqual(["Lab", "Lab", "Lab moved"]);
    expect(twigs.map((twig) => twig.dueDate).sort()).toEqual([
      "2026-05-04",
      "2026-05-12",
      "2026-05-18",
    ]);
    expect(new Set(twigs.map((twig) => twig.seriesId)).size).toBe(1);
  });

  it("makes an existing task repeat when an edit gives it a repeat", async () => {
    const branch = await seedBranch();
    const existing = await createTwig({
      branchId: branch.id,
      title: "Reading",
      dueDate: "2026-05-04",
      status: "inprogress",
    });
    const { result } = await mount();

    await act(() =>
      result.current.saveTwig(
        {
          ...editValues(branch.id),
          title: "Reading",
          date: "2026-05-04",
          status: "inprogress",
          repeat: "weekly",
          repeatUntil: "2026-05-18",
        },
        existing,
      ),
    );

    const twigs = (await listTwigs()).sort((left, right) =>
      String(left.dueDate).localeCompare(String(right.dueDate)),
    );

    expect(twigs.map((twig) => twig.dueDate)).toEqual(["2026-05-04", "2026-05-11", "2026-05-18"]);
    // The task that was there keeps its id and status; the new ones start fresh.
    expect(twigs[0]).toMatchObject({ id: existing.id, status: "inprogress" });
    expect(twigs[1].status).toBe("incomplete");
    expect(new Set(twigs.map((twig) => twig.seriesId)).size).toBe(1);
    expect(twigs[0].seriesId).not.toBeNull();
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
