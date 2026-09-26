import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetKeyring, holdKeyring } from "@/lib/keys/object-keys";
import { getNotesDb } from "@/lib/notes-db";

import { useNoteAccess } from "./use-note-access";

async function note(id: string, keyId: string) {
  const database = await getNotesDb();

  await database.put("notes-directory", {
    id,
    branchId: "b",
    nestIds: [],
    feather: id,
    createdMode: "linear",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    keyId,
  });
}

beforeEach(async () => {
  await (await getNotesDb()).clear("notes-directory");
  await note("theirs", "their-key");
  await note("mine", "my-key");
  holdKeyring(new Map(), {
    keys: [],
    wraps: [],
    grants: [
      { keyId: "their-key", role: "reader", wrapped: "g" },
      { keyId: "my-key", role: "writer", wrapped: "g" },
    ],
  });
});

afterEach(() => {
  forgetKeyring();
});

describe("useNoteAccess", () => {
  it("reports a note shared to read as read-only", async () => {
    const { result } = renderHook(() => useNoteAccess("theirs"));

    await waitFor(() => expect(result.current.isReadOnly).toBe(true));
  });

  it("never shows one note's answer for the next while it is looked up", async () => {
    const initialProps: { id: string | null } = { id: "theirs" };
    const { result, rerender } = renderHook(({ id }) => useNoteAccess(id), { initialProps });

    await waitFor(() => expect(result.current.isReadOnly).toBe(true));

    rerender({ id: "mine" });

    // Straight away, before the lookup for the new note has answered.
    expect(result.current.isReadOnly).toBe(false);

    rerender({ id: null });

    await waitFor(() => expect(result.current.isReadOnly).toBe(false));
  });
});
