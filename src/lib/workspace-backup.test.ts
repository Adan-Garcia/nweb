// @vitest-environment node
//
// Node, not jsdom: fake-indexeddb's structured clone turns a jsdom Blob into a bare
// object with no arrayBuffer(), which the export has to read. Node's Blob survives the
// round trip intact, so this is the environment that matches a real browser. The
// legacy-calendar half needs window.localStorage, which node has no business providing.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bytesToBase64 } from "./base64";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "./cipher";
import { getNotesDb } from "./notes-db";
import { listNotesDirectoryEntries } from "./notes-directory-storage";
import { listTwigs } from "./twig-storage";
import {
  createWorkspaceBackup,
  decryptWorkspaceBackup,
  encryptWorkspaceBackup,
  type ParsedBackupFile,
  parseWorkspaceBackup,
} from "./workspace-backup";
import { createWorkspaceLock } from "./workspace-passphrase";
import { restoreWorkspaceBackup } from "./workspace-restore";
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

/** Narrows the three-way result to the plaintext backup these tests are about. */
function plainBackup(parsed: ParsedBackupFile) {
  if ("error" in parsed) {
    throw new Error(parsed.error);
  }

  if ("encrypted" in parsed) {
    throw new Error("expected a plaintext backup");
  }

  return parsed.backup;
}

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
  dueMinutes: 540,
  timeZone: "America/New_York",
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

    const summary = await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)));
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

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)));

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
    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(legacyFile())));

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
    const summary = await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(legacyFile())));
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

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)));

    const database = await getNotesDb();
    expect(await database.get("notes-directory", "legacy-note")).toMatchObject({
      deletedAt: null,
    });
  });
});

describe("an encrypted backup", () => {
  beforeEach(clearAll);

  // A low iteration count: what matters here is the round trip, not the derivation cost.
  const seal = (backup: Awaited<ReturnType<typeof createWorkspaceBackup>>) =>
    encryptWorkspaceBackup(backup, "correct horse");

  it("round-trips through the file and back into an empty workspace", async () => {
    await seed();
    const file = JSON.stringify(await seal(await createWorkspaceBackup()));
    await clearAll();

    const parsed = parseWorkspaceBackup(file);
    if (!("encrypted" in parsed)) throw new Error("expected an encrypted file");

    const opened = await decryptWorkspaceBackup(parsed.encrypted, "correct horse");
    const summary = await restoreWorkspaceBackup(plainBackup(opened));

    expect(summary).toEqual({ notes: 1, media: 1, events: 1 });
    expect(await listNotesDirectoryEntries()).toHaveLength(1);
    expect(await listTwigs()).toEqual([TWIG]);
  });

  it("is recognised as encrypted rather than rejected as not a backup", async () => {
    await seed();
    const file = JSON.stringify(await seal(await createWorkspaceBackup()));

    expect(parseWorkspaceBackup(file)).toMatchObject({
      encrypted: { format: "cuervo-planner-encrypted" },
    });
  });

  it("keeps the notes out of the file", async () => {
    await seed();
    const file = JSON.stringify(await seal(await createWorkspaceBackup()));

    // The note's title would be right there in a plaintext export.
    expect(file).not.toContain("Lecture");
    expect(file).not.toContain("Essay due");
  });

  it("says so for the wrong passphrase, and restores nothing", async () => {
    await seed();
    const file = JSON.stringify(await seal(await createWorkspaceBackup()));

    const parsed = parseWorkspaceBackup(file);
    if (!("encrypted" in parsed)) throw new Error("expected an encrypted file");

    expect(await decryptWorkspaceBackup(parsed.encrypted, "wrong")).toEqual({
      error: "That passphrase does not open this file.",
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

describe("a backup and the workspace lock", () => {
  afterEach(() => {
    resetActiveCipher();
  });

  async function lockedCipher() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);

    return createAesGcmCipher(key, "test-key");
  }

  it("writes the file in the clear, because the workspace key never leaves this browser", async () => {
    await seed();
    await createWorkspaceLock("correct horse battery");

    const backup = await createWorkspaceBackup();

    // A file carrying rows sealed with the workspace key could only ever be restored on
    // this device: nothing else can derive it. The envelope is what protects the file.
    expect(backup.workspace.wings[0].name).toBe("Home");
    expect(backup.twigs[0].title).toBe(TWIG.title);
    expect(backup.notes.directory[0]).toMatchObject({ feather: ENTRY.feather });
    expect(JSON.stringify(backup)).not.toContain("aes-gcm");
  });

  it("seals what it restores, so a file does not leave readable rows in a locked workspace", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());

    const database = await getNotesDb();
    await Promise.all(STORES.map((name) => database.clear(name)));
    setActiveCipher(await lockedCipher());

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)));

    const [storedWing] = await database.getAll("wings");
    expect(storedWing.name).not.toBe("Home");
    expect(storedWing.encryption).toBe("aes-gcm");
    // And it reads back through the storage layer, which is what opens it.
    expect((await loadWorkspaceSnapshot()).wings[0].name).toBe("Home");
  });

  it("refuses a file whose rows were sealed by a key this browser has not got", async () => {
    await seed();
    setActiveCipher(await lockedCipher());
    const sealedFile = {
      ...plainBackup(parseWorkspaceBackup(JSON.stringify(await createWorkspaceBackup()))),
    };
    resetActiveCipher();

    // A build between the lock shipping and this one could write such a file. Restoring it
    // as though it were plaintext would store ciphertext as the course name.
    await expect(
      restoreWorkspaceBackup({
        ...sealedFile,
        workspace: {
          ...sealedFile.workspace,
          wings: [{ ...WING, name: "gibberish", encryption: "aes-gcm" as const }],
        },
      }),
    ).rejects.toThrow(/not unlocked/);
  });
});

describe("a merge-style restore", () => {
  /** The same note, changed here after the backup was taken. */
  async function editEntryHere(feather: string, updatedAt: number) {
    const database = await getNotesDb();
    await database.put("notes-directory", { ...ENTRY, feather, updatedAt });
  }

  it("keeps the newer of the two, note by note", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());

    await editEntryHere("Lecture, rewritten", ENTRY.updatedAt + 1_000);

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "merge");

    // The copy here is newer, so the file does not overwrite it.
    expect((await listNotesDirectoryEntries())[0].feather).toBe("Lecture, rewritten");
  });

  it("takes the file's copy when the file is the newer one", async () => {
    await seed();
    await editEntryHere("Lecture, rewritten", ENTRY.updatedAt + 1_000);
    const file = JSON.stringify(await createWorkspaceBackup());

    await editEntryHere("Lecture", ENTRY.updatedAt);

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "merge");

    expect((await listNotesDirectoryEntries())[0].feather).toBe("Lecture, rewritten");
  });

  it("leaves rows the file has never heard of alone", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());

    const database = await getNotesDb();
    await database.put("notes-directory", {
      ...ENTRY,
      id: "note-2",
      feather: "Written since",
      updatedAt: 5,
    });

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "merge");

    expect(await database.get("notes-directory", "note-2")).toBeDefined();
    // Where a replace would have cleared it.
    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "replace");
    expect(await database.get("notes-directory", "note-2")).toBeUndefined();
  });

  it("keeps a deletion made since the backup, because a tombstone is a row like any other", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());

    const database = await getNotesDb();
    await database.put("notes-directory", {
      ...ENTRY,
      deletedAt: ENTRY.updatedAt + 1_000,
      updatedAt: ENTRY.updatedAt + 1_000,
    });

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "merge");

    // The note does not come back: the delete is newer than the file's copy of it.
    expect(await listNotesDirectoryEntries()).toEqual([]);
    expect((await database.get("notes-directory", ENTRY.id))?.deletedAt).toBeGreaterThan(0);
  });

  it("brings back a note deleted before the backup and written since", async () => {
    await seed();
    const database = await getNotesDb();
    await database.put("notes-directory", { ...ENTRY, feather: "Revived", updatedAt: 9_000 });
    const file = JSON.stringify(await createWorkspaceBackup());

    await database.put("notes-directory", { ...ENTRY, deletedAt: 5, updatedAt: 5 });

    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)), "merge");

    expect((await listNotesDirectoryEntries())[0].feather).toBe("Revived");
  });

  it("replaces by default, which is what a new device wants", async () => {
    await seed();
    const file = JSON.stringify(await createWorkspaceBackup());

    await editEntryHere("Lecture, rewritten", ENTRY.updatedAt + 1_000);
    await restoreWorkspaceBackup(plainBackup(parseWorkspaceBackup(file)));

    expect((await listNotesDirectoryEntries())[0].feather).toBe("Lecture");
  });
});
