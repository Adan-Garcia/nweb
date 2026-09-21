// @vitest-environment node
//
// Node, not jsdom: fake-indexeddb's structured clone turns a jsdom Blob into a bare
// object with no arrayBuffer(), which the export has to read. Node's Blob survives the
// round trip intact, so this is the environment that matches a real browser. The
// legacy-calendar half needs window.localStorage, which node has no business providing.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "./notes-db";
import { listNotesDirectoryEntries } from "./notes-directory-storage";
import { listTwigs } from "./twig-storage";
import {
  createWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
} from "./workspace-backup";
import { bytesToBase64 } from "./workspace-backup-schema";
import { loadWorkspaceSnapshot } from "./workspace-storage";

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

const STAMP = { createdAt: 1, updatedAt: 2, deletedAt: null };

const WING = { id: "wing-1", name: "Home", ...STAMP };
const FLIGHT = {
  id: "flight-1",
  wingId: "wing-1",
  name: "Fall 2026",
  term: "Fall",
  year: 2026,
  ...STAMP,
} as const;
const BRANCH = {
  id: "branch-1",
  flightId: "flight-1",
  name: "Math",
  color: "emerald",
  ...STAMP,
} as const;
const NEST = { id: "nest-1", branchId: "branch-1", name: "Unit 1", ...STAMP };

const ENTRY = {
  id: "note-1",
  branchId: "branch-1",
  nestIds: ["nest-1"],
  feather: "Lecture",
  createdMode: "linear" as const,
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
};

const TWIG = {
  id: "twig-1",
  branchId: "branch-1",
  nestIds: [],
  title: "Essay due",
  kind: "essay" as const,
  dueDate: "2026-09-21",
  dueTime: "09:00",
  status: "incomplete" as const,
  boardOrder: 0,
  featherId: null,
  ...STAMP,
};

const PEBBLE = {
  id: "pebble-1",
  branchId: "branch-1",
  nestIds: [],
  name: "Handout",
  mimeType: "image/webp",
  size: 3,
  mediaId: "file-1",
  featherId: null,
  ...STAMP,
};

const STORES = [
  "notes-directory",
  "notes-documents",
  "notes-media",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
] as const;

async function seed() {
  const database = await getNotesDb();

  await database.put("wings", WING);
  await database.put("flights", FLIGHT);
  await database.put("branches", BRANCH);
  await database.put("nests", NEST);
  await database.put("notes-directory", ENTRY);
  await database.put("twigs", TWIG);
  await database.put("pebbles", PEBBLE);
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
}

async function clearAll() {
  const database = await getNotesDb();

  await Promise.all(STORES.map((store) => database.clear(store)));
  localStorageStub.clear();
}

describe("workspace backup", () => {
  beforeEach(clearAll);

  it("captures the entities, notes, media, tasks and files", async () => {
    await seed();

    const backup = await createWorkspaceBackup(new Date("2026-09-20T10:00:00Z"));

    expect(backup.format).toBe("cuervo-planner-backup");
    expect(backup.version).toBe(2);
    expect(backup.exportedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(backup.workspace).toEqual({
      wings: [WING],
      flights: [FLIGHT],
      branches: [BRANCH],
      nests: [NEST],
    });
    expect(backup.notes.directory).toEqual([ENTRY]);
    expect(backup.twigs).toEqual([TWIG]);
    expect(backup.pebbles).toEqual([PEBBLE]);
    expect(backup.notes.documents[0].linearCompressed).toBe(
      bytesToBase64(new Uint8Array([1, 2, 3])),
    );
    expect(backup.notes.media[0].data).toBe(bytesToBase64(new Uint8Array([9, 8, 7])));
  });

  it("carries deleted notes through as tombstones, still hidden from the app", async () => {
    await seed();
    const database = await getNotesDb();
    const tombstone = { ...ENTRY, id: "deleted-note", feather: "Dropped", deletedAt: 5 };
    await database.put("notes-directory", tombstone);

    const backup = await createWorkspaceBackup();

    // The marker travels: without it a restore could not tell a note that was deleted
    // from one that never existed, and every deletion since the backup would come back.
    expect(backup.notes.directory).toContainEqual(tombstone);

    await clearAll();
    await restoreWorkspaceBackup(backup);

    expect(await database.get("notes-directory", "deleted-note")).toEqual(tombstone);
    expect((await listNotesDirectoryEntries()).map((entry) => entry.id)).toEqual([ENTRY.id]);
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
    expect(await loadWorkspaceSnapshot()).toEqual({
      wings: [WING],
      flights: [FLIGHT],
      branches: [BRANCH],
      nests: [NEST],
    });
    expect(await listTwigs()).toEqual([TWIG]);
    expect((await database.get("notes-documents", ENTRY.id))?.linearCompressed).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Uint8Array(await media!.blob.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("replaces what is already stored rather than merging into it", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());
    await clearAll();
    await seed();

    const database = await getNotesDb();
    await database.put("notes-directory", { ...ENTRY, id: "notes-stale", feather: "Stale" });
    await database.put("wings", { ...WING, id: "wing-stale", name: "Stale" });

    const parsed = parseWorkspaceBackup(file);
    if ("error" in parsed) throw new Error(parsed.error);
    await restoreWorkspaceBackup(parsed.backup);

    expect(await database.get("notes-directory", "notes-stale")).toBeUndefined();
    expect(await database.get("wings", "wing-stale")).toBeUndefined();
    expect(await database.count("notes-directory")).toBe(1);
  });
});

describe("restoring a version 1 backup", () => {
  beforeEach(clearAll);

  const legacyFile = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: "cuervo-planner-backup",
      version: 1,
      exportedAt: "2026-09-20T00:00:00.000Z",
      notes: {
        directory: [
          {
            id: "legacy-note",
            wing: "Home",
            flight: "Fall 2026",
            branch: "Math",
            nest: "Unit 1",
            feather: "Lecture",
            createdMode: "linear",
            createdAt: 1,
            updatedAt: 2,
            deletedAt: null,
          },
        ],
        documents: [],
        media: [],
      },
      calendar: [
        {
          id: 1,
          title: "Essay due",
          date: "2026-09-21",
          time: "09:00",
          color: "Math",
          status: "incomplete",
        },
      ],
      ...overrides,
    });

  it("converts its string paths into entities, the way the database upgrade does", async () => {
    const parsed = parseWorkspaceBackup(legacyFile());
    if ("error" in parsed) throw new Error(parsed.error);

    await restoreWorkspaceBackup(parsed.backup);

    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot.wings.map((wing) => wing.name)).toEqual(["Home"]);
    expect(snapshot.flights[0]).toMatchObject({ name: "Fall 2026", term: "Fall", year: 2026 });
    expect(snapshot.nests.map((nest) => nest.name)).toEqual(["Unit 1"]);

    const [entry] = await listNotesDirectoryEntries();
    expect(entry).toMatchObject({ id: "legacy-note", feather: "Lecture" });
    expect(entry.branchId).toBe(snapshot.branches.find((b) => b.name === "Math")?.id);
    expect(entry.nestIds).toEqual([snapshot.nests[0].id]);
  });

  it("turns its calendar events into twigs", async () => {
    const parsed = parseWorkspaceBackup(legacyFile());
    if ("error" in parsed) throw new Error(parsed.error);

    const summary = await restoreWorkspaceBackup(parsed.backup);
    const twigs = await listTwigs();

    expect(summary.events).toBe(1);
    expect(twigs[0]).toMatchObject({
      title: "Essay due",
      dueDate: "2026-09-21",
      dueTime: "09:00",
      status: "incomplete",
    });
  });

  it("restores a file written before the tombstone field existed", async () => {
    const file = legacyFile({
      notes: {
        directory: [
          {
            id: "legacy-note",
            wing: "Home",
            flight: "Fall 2026",
            branch: "Math",
            nest: "Unit 1",
            feather: "Lecture",
            createdMode: "linear",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        documents: [],
        media: [],
      },
    });
    // A file exported by that version has no deletedAt key at all.
    expect(file).not.toContain("deletedAt");

    const parsed = parseWorkspaceBackup(file);
    if ("error" in parsed) throw new Error(parsed.error);
    await restoreWorkspaceBackup(parsed.backup);

    const database = await getNotesDb();
    expect(await database.get("notes-directory", "legacy-note")).toMatchObject({
      deletedAt: null,
    });
  });
});

describe("parsing a backup file", () => {
  beforeEach(clearAll);

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
    expect(backup.twigs).toEqual([]);
    expect(backup.workspace.wings).toEqual([]);
  });
});
