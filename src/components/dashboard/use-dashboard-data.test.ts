import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { formatDateKey } from "@/components/calendar/calendar-shared";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { createBranch, createFlight, createWing } from "@/lib/hierarchy/entity-storage";
import { createNotesDirectoryEntry } from "@/lib/notes/notes-directory-storage";
import { createTwig } from "@/lib/twigs/twig-storage";

import { useDashboardData } from "./use-dashboard-data";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("twigs"),
    database.clear("notes-directory"),
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
  ]);
});

describe("useDashboardData", () => {
  it("derives the dashboard from the stored twigs and notes", async () => {
    const today = formatDateKey(new Date());
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Biology" });

    await createTwig({ branchId: branch.id, title: "Due now", dueDate: today, dueTime: "9:00 AM" });
    await createTwig({ branchId: branch.id, title: "Long gone", dueDate: "2000-01-01" });
    // An undated task is a task, but it is not on the calendar and not a deadline.
    await createTwig({ branchId: branch.id, title: "Someday" });
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Dashboard note" });

    const { result } = renderHook(() => useDashboardData());
    expect(result.current.isNotesLoading).toBe(true);

    await waitFor(() => expect(result.current.isNotesLoading).toBe(false));

    expect(result.current.dueToday.map((item) => item.title)).toEqual(["Due now"]);
    expect(result.current.overdueCount).toBe(1);
    expect(result.current.nextPriority?.title).toBe("Due now");
    expect(result.current.recentNotes.map((entry) => entry.feather)).toContain("Dashboard note");
    expect(result.current.notesUpdatedThisWeekCount).toBeGreaterThanOrEqual(1);
  });

  it("reads the branch names through the snapshot, so labels follow a rename", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Biology" });
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Note" });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isNotesLoading).toBe(false));

    expect(result.current.snapshot.branches.map((row) => row.name)).toEqual(["Biology"]);
  });

  it("loads nothing while the workspace is locked, instead of failing the page", async () => {
    const wing = await createWing("My Wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Biology" });
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Note" });

    // Sealed by a key that is then dropped, which is what a locked workspace looks like.
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    setActiveCipher(createAesGcmCipher(key, "test-key"));
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Sealed note" });
    resetActiveCipher();

    const { result } = renderHook(() => useDashboardData());

    // The shell is showing the lock screen over this page; an unreadable row here is that,
    // not a fault worth reporting.
    await waitFor(() => expect(result.current.isNotesLoading).toBe(false));
    expect(result.current.recentNotes).toEqual([]);
  });
});
