// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "../db/notes-db";
import { canWriteNote, isReadOnlyKey, keyAccess } from "./access";
import { forgetKeyring, holdKeyring, holdServedGraph } from "./object-keys";

const wrap = (parentKeyId: string, childKeyId: string) => ({
  parentKeyId,
  childKeyId,
  wrapped: "w",
});

/** Own wing as a writer; a course shared to read; a note shared to change. */
const GRAPH = {
  keys: [],
  wraps: [wrap("wing", "course"), wrap("shared-course", "shared-note"), wrap("pen", "pen-note")],
  grants: [
    { keyId: "wing", role: "writer" as const, wrapped: "g" },
    { keyId: "shared-course", role: "reader" as const, wrapped: "g" },
    { keyId: "pen", role: "writer" as const, wrapped: "g" },
  ],
};

afterEach(() => {
  forgetKeyring();
});

describe("keyAccess", () => {
  it("walks readable and writable keys from the grants, down the wraps", () => {
    const access = keyAccess([GRAPH, null]);

    expect([...access.reachable].sort()).toEqual([
      "course",
      "pen",
      "pen-note",
      "shared-course",
      "shared-note",
      "wing",
    ]);
    expect([...access.writable].sort()).toEqual(["course", "pen", "pen-note", "wing"]);
  });

  it("treats a key reached as a writer by any route as writable", () => {
    const access = keyAccess([
      GRAPH,
      { keys: [], wraps: [wrap("pen", "shared-note")], grants: [] },
    ]);

    expect(isReadOnlyKey("shared-note", access)).toBe(false);
  });
});

describe("isReadOnlyKey", () => {
  it("is true only for a key reached through reader grants alone", () => {
    const access = keyAccess([GRAPH]);

    expect(isReadOnlyKey("shared-note", access)).toBe(true);
    expect(isReadOnlyKey("shared-course", access)).toBe(true);
    expect(isReadOnlyKey("course", access)).toBe(false);
    expect(isReadOnlyKey("pen-note", access)).toBe(false);
  });

  it("treats a key it cannot place, or no key at all, as this workspace's own", () => {
    const access = keyAccess([GRAPH]);

    expect(isReadOnlyKey("minted-offline", access)).toBe(false);
    expect(isReadOnlyKey(undefined, access)).toBe(false);
    expect(isReadOnlyKey(null)).toBe(false);
  });

  it("reads the held graph and the one the server last served", () => {
    holdKeyring(new Map(), { keys: [], wraps: [], grants: [GRAPH.grants[0]] });

    expect(isReadOnlyKey("shared-course")).toBe(false);

    holdServedGraph(GRAPH);

    expect(isReadOnlyKey("shared-course")).toBe(true);

    // Locking forgets both, so a signed-out device is a local workspace again.
    forgetKeyring();

    expect(isReadOnlyKey("shared-course")).toBe(false);
  });
});

describe("canWriteNote", () => {
  beforeEach(async () => {
    const database = await getNotesDb();

    await database.clear("notes-directory");
  });

  it("asks the note's directory row which key it is under", async () => {
    const database = await getNotesDb();

    holdKeyring(new Map(), GRAPH);
    await database.put("notes-directory", {
      id: "note-1",
      branchId: "b",
      nestIds: [],
      feather: "Shared",
      createdMode: "linear",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      keyId: "shared-note",
    });

    expect(await canWriteNote("note-1")).toBe(false);
    expect(await canWriteNote("missing")).toBe(true);
    expect(await canWriteNote(null)).toBe(true);
  });
});
