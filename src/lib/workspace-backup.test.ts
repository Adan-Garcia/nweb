// @vitest-environment node
//
// Node, not jsdom: fake-indexeddb's structured clone turns a jsdom Blob into a bare
// object with no arrayBuffer(), which the export has to read. Node's Blob survives the
// round trip intact, so this is the environment that matches a real browser. The
// calendar half needs window.localStorage, which node has no business providing.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { saveCalendarEvents } from "./calendar-storage";
import { getNotesDb } from "./notes-db";
import {
  createWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
} from "./workspace-backup";
import { bytesToBase64 } from "./workspace-backup-schema";

function createLocalStorageStub() {
  const entries = new Map<string, string>();

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    clear: () => entries.clear(),
  };
}

const localStorageStub = createLocalStorageStub();

vi.stubGlobal("window", { localStorage: localStorageStub });

afterAll(() => {
  vi.unstubAllGlobals();
});

const ENTRY = {
  id: "notes-home-fall-2026-math-unit-1-lecture",
  wing: "Home",
  flight: "Fall 2026",
  branch: "Math",
  nest: "Unit 1",
  feather: "Lecture",
  createdMode: "linear" as const,
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
};

const EVENT = {
  id: 1,
  title: "Essay due",
  date: "2026-09-21",
  time: "09:00",
  color: "Math" as const,
  status: "incomplete" as const,
};

async function seed() {
  const database = await getNotesDb();

  await database.put("notes-directory", ENTRY);
  await database.put("notes-documents", {
    id: ENTRY.id,
    linearCompressed: new Uint8Array([1, 2, 3]),
    linearCompressionAlgorithm: "gzip",
    sceneCompressed: null,
    sceneCompressionAlgorithm: null,
    sceneFiles: [{ id: "file-1", mimeType: "image/webp", created: 3 }],
    updatedAt: 4,
  });
  await database.put("notes-media", {
    id: "file-1",
    blob: new Blob([new Uint8Array([9, 8, 7])], { type: "image/webp" }),
    mimeType: "image/webp",
    created: 3,
    updatedAt: 4,
  });
  saveCalendarEvents([EVENT]);
}

async function clearAll() {
  const database = await getNotesDb();

  await Promise.all([
    database.clear("notes-directory"),
    database.clear("notes-documents"),
    database.clear("notes-media"),
  ]);
  localStorageStub.clear();
}

describe("workspace backup", () => {
  beforeEach(clearAll);

  it("captures notes, their media and the calendar", async () => {
    await seed();

    const backup = await createWorkspaceBackup(new Date("2026-09-20T10:00:00Z"));

    expect(backup.format).toBe("cuervo-planner-backup");
    expect(backup.exportedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(backup.notes.directory).toEqual([ENTRY]);
    expect(backup.notes.documents[0].linearCompressed).toBe(
      bytesToBase64(new Uint8Array([1, 2, 3])),
    );
    expect(backup.notes.media[0].data).toBe(bytesToBase64(new Uint8Array([9, 8, 7])));
    expect(backup.calendar).toEqual([EVENT]);
  });

  it("round-trips through JSON back into an empty workspace", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());
    await clearAll();

    const parsed = parseWorkspaceBackup(file);

    if ("error" in parsed) {
      throw new Error(parsed.error);
    }

    const summary = await restoreWorkspaceBackup(parsed.backup);
    const database = await getNotesDb();
    const media = await database.get("notes-media", "file-1");

    expect(summary).toEqual({ notes: 1, media: 1, events: 1 });
    expect(await database.get("notes-directory", ENTRY.id)).toEqual(ENTRY);
    expect((await database.get("notes-documents", ENTRY.id))?.linearCompressed).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Uint8Array(await media!.blob.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
    expect(JSON.parse(localStorageStub.getItem("cuervo-calendar-events-v1") ?? "[]")).toEqual([
      EVENT,
    ]);
  });

  it("replaces what is already stored rather than merging into it", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());
    await clearAll();
    await seed();

    const database = await getNotesDb();
    await database.put("notes-directory", { ...ENTRY, id: "notes-stale", feather: "Stale" });

    const parsed = parseWorkspaceBackup(file);
    if ("error" in parsed) throw new Error(parsed.error);
    await restoreWorkspaceBackup(parsed.backup);

    expect(await database.get("notes-directory", "notes-stale")).toBeUndefined();
    expect(await database.count("notes-directory")).toBe(1);
  });

  it("restores a backup written before the tombstone field existed", async () => {
    const backup = {
      format: "cuervo-planner-backup",
      version: 1,
      exportedAt: "2026-09-20T00:00:00.000Z",
      notes: {
        directory: [{ ...ENTRY, deletedAt: undefined }],
        documents: [],
        media: [],
      },
      calendar: [],
    };
    // A file exported by the shipped version has no deletedAt key at all.
    const file = JSON.stringify(backup);
    expect(file).not.toContain("deletedAt");

    const parsed = parseWorkspaceBackup(file);
    if ("error" in parsed) throw new Error(parsed.error);
    await restoreWorkspaceBackup(parsed.backup);

    const database = await getNotesDb();
    expect(await database.get("notes-directory", ENTRY.id)).toMatchObject({ deletedAt: null });
  });

  it("rejects a file that is not JSON", () => {
    expect(parseWorkspaceBackup("not json at all")).toEqual({
      error: "That file is not valid JSON.",
    });
  });

  it("rejects JSON that is not a backup", () => {
    const result = parseWorkspaceBackup(JSON.stringify({ hello: "world" }));

    expect(result).toEqual({
      error: "That file is not a Cuervo Planner backup, or it is from a newer version.",
    });
  });

  it("rejects a backup written by a newer version of the app", async () => {
    await seed();
    const backup = await createWorkspaceBackup();
    const result = parseWorkspaceBackup(JSON.stringify({ ...backup, version: 99 }));

    expect("error" in result).toBe(true);
  });

  it("exports an empty workspace without failing", async () => {
    const backup = await createWorkspaceBackup();

    expect(backup.notes.directory).toEqual([]);
    expect(backup.calendar).toEqual([]);
  });
});
