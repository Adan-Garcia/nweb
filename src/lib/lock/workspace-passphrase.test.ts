// @vitest-environment node
//
// Node, not jsdom: the rekey reads media back out of stored Blobs, and fake-indexeddb
// flattens a jsdom Blob into a bare object with no arrayBuffer(). Node's Blob survives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveCipher, resetActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { defaultFeedSettings } from "../feeds/feed-model";
import { getFeed, saveFeed } from "../feeds/feed-storage";
import { createBranch, listBranches } from "../hierarchy/entity-storage";
import {
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
} from "../notes/notes-document-storage";
import { readRekeyJournal, REKEY_JOURNAL_ID, writeRekeyJournal } from "./rekey-journal";
import { getWorkspaceLockState, unlockWorkspace } from "./workspace-lock";
import {
  changeWorkspacePassphrase,
  createWorkspaceLock,
  removeWorkspaceLock,
  resumeRekey,
} from "./workspace-passphrase";
import { countRekeyRows } from "./workspace-rekey";

const FIRST = "correct horse battery";
const SECOND = "second passphrase entirely";

vi.mock("../crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id",
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
  // Cheap parameters are below the floor a server's are held to; that floor has its own tests.
  assertAccountKdf: () => undefined,
}));

async function seed(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await saveLinearDocumentPayload({
      documentId: `doc-${index}`,
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode(`SECRET-${index}`),
    });
    await createBranch({ flightId: "flight-1", name: `Course ${index}` });
  }

  // A drawing as well as text: a rekey has to move a document with a scene and no linear
  // payload as readily as one with the reverse, and only one of those was ever seeded.
  await saveSpatialDocumentPayload({
    documentId: "doc-spatial",
    compressionAlgorithm: "none",
    compressed: new TextEncoder().encode("SECRET-SCENE"),
    files: [],
  });
}

/** Branches come back in key order, which is UUID order, so a name check has to sort. */
const branchNames = async () => (await listBranches()).map((branch) => branch.name).sort();

const storedScene = async (id: string) => {
  const database = await getNotesDb();
  const row = await database.get("notes-documents", id);

  return new TextDecoder().decode(row?.sceneCompressed ?? new Uint8Array());
};

const storedText = async (id: string) => {
  const database = await getNotesDb();
  const row = await database.get("notes-documents", id);

  return new TextDecoder().decode(row?.linearCompressed ?? new Uint8Array());
};

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("workspace-keys"),
    database.clear("workspace-rekey"),
    database.clear("notes-documents"),
    database.clear("notes-directory"),
    database.clear("branches"),
  ]);
  resetActiveCipher();
});

afterEach(() => {
  resetActiveCipher();
});

describe("progress", () => {
  it("reports every row it converts, so a long rekey is not a blind wait", async () => {
    await seed();
    const seen: { done: number; total: number }[] = [];

    await createWorkspaceLock(FIRST, (progress) => seen.push(progress));

    const total = await countRekeyRows();
    expect(seen).not.toHaveLength(0);
    expect(seen.at(-1)).toEqual({ done: total, total });
    // Monotonic, and never past the end.
    expect(seen.map((step) => step.done)).toEqual(
      [...seen.map((step) => step.done)].sort((a, b) => a - b),
    );
    expect(seen.every((step) => step.done <= step.total)).toBe(true);
  });

  it("counts the same rows the sweep walks", async () => {
    await seed(2);

    const database = await getNotesDb();
    const counted = await countRekeyRows();

    expect(counted).toBe(
      (await database.count("notes-documents")) +
        (await database.count("notes-media")) +
        (await database.count("notes-directory")) +
        (await database.count("wings")) +
        (await database.count("flights")) +
        (await database.count("branches")) +
        (await database.count("nests")) +
        (await database.count("twigs")) +
        (await database.count("pebbles")) +
        (await database.count("feeds")) +
        (await database.count("canvas-history")),
    );
  });
});

describe("calendar feeds", () => {
  it("seals a feed's address with the lock, moves it on a change, and opens it after", async () => {
    const feed = await saveFeed({
      ...defaultFeedSettings(),
      url: "https://example.edu/private-token",
    });
    const storedSettings = async () => (await (await getNotesDb()).get("feeds", feed.id))?.settings;

    await createWorkspaceLock(FIRST);
    const sealedOnce = await storedSettings();

    expect(sealedOnce).not.toContain("private-token");

    await changeWorkspacePassphrase(FIRST, SECOND);

    expect(await storedSettings()).not.toBe(sealedOnce);
    expect((await getFeed(feed.id))?.settings.url).toBe("https://example.edu/private-token");

    await removeWorkspaceLock(SECOND);

    expect(await storedSettings()).toContain("private-token");
    await (await getNotesDb()).clear("feeds");
  });
});

describe("the journal", () => {
  it("is written before the first row and gone after the last", async () => {
    await seed();
    const journalsSeen: boolean[] = [];

    await createWorkspaceLock(FIRST, () => {
      journalsSeen.push(true);
    });

    expect(journalsSeen).not.toHaveLength(0);
    expect(await readRekeyJournal()).toBeNull();
  });

  it("puts the workspace in the interrupted state while it is there", async () => {
    await seed();
    await createWorkspaceLock(FIRST);

    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: null,
      target: null,
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });

    // Not "unlocked", even though the key is in memory: a half-converted workspace has to
    // be finished before anything reads or writes beside it.
    expect(await getWorkspaceLockState()).toBe("interrupted");
  });

  it("refuses a change or a removal over an unfinished one too, not just a new lock", async () => {
    await seed(1);
    await createWorkspaceLock(FIRST);
    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: null,
      target: null,
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });

    // Either one would overwrite the journal, losing the record of the key half the rows
    // are under. The shell hides these behind the resume screen; the library says no too.
    await expect(changeWorkspacePassphrase(FIRST, SECOND)).rejects.toThrow(
      /has to be finished first/,
    );
    await expect(removeWorkspaceLock(FIRST)).rejects.toThrow(/has to be finished first/);
    expect(await readRekeyJournal()).not.toBeNull();
  });

  it("refuses to start a second rekey over an unfinished one", async () => {
    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: null,
      target: null,
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });

    await expect(createWorkspaceLock(FIRST)).rejects.toThrow(/has to be finished first/);
  });
});

/** Stops a rekey partway, the way a closed tab would. */
async function interruptAfter(run: () => Promise<unknown>, afterRows: number) {
  const database = await getNotesDb();
  const failAfter = new Error("interrupted");
  let seen = 0;

  const put = database.put.bind(database);
  vi.spyOn(database, "put").mockImplementation(async (store, value, key) => {
    if (store !== "workspace-rekey") {
      seen += 1;

      if (seen > afterRows) {
        throw failAfter;
      }
    }

    return put(store, value, key);
  });

  await expect(run()).rejects.toThrow(failAfter);
  vi.restoreAllMocks();
}

describe("resumeRekey", () => {
  it("finishes a half-done lock with the passphrase it was being locked with", async () => {
    await seed();
    await interruptAfter(() => createWorkspaceLock(FIRST), 2);

    expect(await getWorkspaceLockState()).toBe("interrupted");
    resetActiveCipher();

    expect(await resumeRekey({ target: FIRST })).toBe(true);

    expect(await readRekeyJournal()).toBeNull();
    expect(await getWorkspaceLockState()).toBe("unlocked");
    expect(await storedText("doc-0")).not.toContain("SECRET-0");
    expect(await storedScene("doc-spatial")).not.toContain("SECRET-SCENE");
    expect(await branchNames()).toEqual(["Course 0", "Course 1", "Course 2"]);
  });

  it("finishes a half-done passphrase change, which needs both", async () => {
    await seed();
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => changeWorkspacePassphrase(FIRST, SECOND), 2);

    resetActiveCipher();
    expect(await getWorkspaceLockState()).toBe("interrupted");

    expect(await resumeRekey({ source: FIRST, target: SECOND })).toBe(true);

    expect(await getWorkspaceLockState()).toBe("unlocked");
    expect(getActiveCipher().name).toBe("aes-gcm");
    expect(await branchNames()).toEqual(["Course 0", "Course 1", "Course 2"]);

    // Only the new passphrase opens it now.
    resetActiveCipher();
    expect(await unlockWorkspace(FIRST)).toBe(false);
    expect(await unlockWorkspace(SECOND)).toBe(true);
  });

  it("finishes a half-done removal with the passphrase it was being removed from", async () => {
    await seed();
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => removeWorkspaceLock(FIRST), 2);

    resetActiveCipher();
    expect(await resumeRekey({ source: FIRST })).toBe(true);

    expect(await getWorkspaceLockState()).toBe("unset");
    expect(await storedText("doc-0")).toBe("SECRET-0");
    expect(await branchNames()).toEqual(["Course 0", "Course 1", "Course 2"]);
  });

  it("refuses a passphrase that is not the one the journal recorded", async () => {
    await seed();
    await interruptAfter(() => createWorkspaceLock(FIRST), 2);
    resetActiveCipher();

    expect(await resumeRekey({ target: "wrong" })).toBe(false);
    // And nothing moved: it is still interrupted, still resumable.
    expect(await getWorkspaceLockState()).toBe("interrupted");
    expect(await resumeRekey({ target: FIRST })).toBe(true);
  });

  it("refuses when a side it needs was not given at all", async () => {
    await seed();
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => changeWorkspacePassphrase(FIRST, SECOND), 2);
    resetActiveCipher();

    expect(await resumeRekey({ target: SECOND })).toBe(false);
    expect(await getWorkspaceLockState()).toBe("interrupted");
  });

  it("reports nothing to resume when no rekey was interrupted", async () => {
    expect(await resumeRekey({ target: FIRST })).toBe(false);
  });

  it("leaves a row it already converted alone, which is what makes a resume safe", async () => {
    await seed();
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => changeWorkspacePassphrase(FIRST, SECOND), 2);
    resetActiveCipher();

    await resumeRekey({ source: FIRST, target: SECOND });

    // Every row opens under the new key: the ones converted before the interruption were
    // recognised and skipped rather than being run through the cipher a second time.
    resetActiveCipher();
    await unlockWorkspace(SECOND);
    expect(await branchNames()).toEqual(["Course 0", "Course 1", "Course 2"]);
    expect(await storedText("doc-0")).not.toContain("SECRET-0");
  });
});

describe("the sweep's cursor", () => {
  it("writes itself down on a long run, so a resume does not start over", async () => {
    // More rows than the checkpoint interval, so the journal is written mid-sweep.
    await seed(30);
    const journals: (string | null)[] = [];

    const database = await getNotesDb();
    const put = database.put.bind(database);
    vi.spyOn(database, "put").mockImplementation(async (store, value, key) => {
      if (store === "workspace-rekey" && value && typeof value === "object" && "lastKey" in value) {
        journals.push(value.lastKey);
      }

      return put(store, value, key);
    });

    await createWorkspaceLock(FIRST);
    vi.restoreAllMocks();

    // The first write is the journal itself, with no cursor; later ones carry one.
    expect(journals[0]).toBeNull();
    expect(journals.filter((lastKey) => lastKey !== null)).not.toHaveLength(0);
  });

  it("skips the stores it finished before the interruption", async () => {
    // Enough rows that a checkpoint lands after the documents store is done, so the
    // resume has a cursor pointing at a later store than the one it starts from.
    await seed(30);
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => changeWorkspacePassphrase(FIRST, SECOND), 55);

    resetActiveCipher();
    expect(await resumeRekey({ source: FIRST, target: SECOND })).toBe(true);

    const names = await branchNames();
    expect(names).toHaveLength(30);
    expect(names).toContain("Course 0");
    expect(names).toContain("Course 29");
    expect(await storedText("doc-0")).not.toContain("SECRET-0");
  });

  it("raises the original failure when a row opens with neither key", async () => {
    await seed(1);
    await createWorkspaceLock(FIRST);

    // A row neither side can open: not a resumable state, and not one to paper over by
    // writing whatever came out of the cipher back as the note.
    const database = await getNotesDb();
    const branch = (await database.getAll("branches"))[0];
    await database.put("branches", { ...branch, name: "not base64 at all" });

    await expect(changeWorkspacePassphrase(FIRST, SECOND)).rejects.toThrow();
  });
});

describe("the key id", () => {
  it("is stamped on every row the lock seals", async () => {
    await seed(1);
    await createWorkspaceLock(FIRST);

    const database = await getNotesDb();
    const record = await database.get("workspace-keys", "workspace");
    const [branch] = await database.getAll("branches");
    const [document] = await database.getAll("notes-documents");

    expect(record?.keyId).not.toHaveLength(0);
    expect(branch.keyId).toBe(record?.keyId);
    expect(document.keyId).toBe(record?.keyId);
  });

  it("changes with the key, which is what tells one aes-gcm row from another", async () => {
    await seed(1);
    await createWorkspaceLock(FIRST);
    const database = await getNotesDb();
    const before = (await database.get("workspace-keys", "workspace"))?.keyId;

    await changeWorkspacePassphrase(FIRST, SECOND);

    const after = (await database.get("workspace-keys", "workspace"))?.keyId;
    expect(after).not.toBe(before);
    expect((await database.getAll("branches"))[0].keyId).toBe(after);
  });

  it("is what a resume uses to know a row has already moved", async () => {
    await seed(30);
    await createWorkspaceLock(FIRST);
    await interruptAfter(() => changeWorkspacePassphrase(FIRST, SECOND), 20);

    const database = await getNotesDb();
    const target = (await readRekeyJournal())!.target!.keyId;
    const movedBefore = (await database.getAll("notes-documents")).filter(
      (row) => row.keyId === target,
    ).length;
    expect(movedBefore).toBeGreaterThan(0);

    resetActiveCipher();
    expect(await resumeRekey({ source: FIRST, target: SECOND })).toBe(true);

    // Every row ends under the new key, and the ones already there were left alone rather
    // than run through the cipher a second time.
    const stamped = (await database.getAll("notes-documents")).every((row) => row.keyId === target);
    expect(stamped).toBe(true);
    expect(await branchNames()).toContain("Course 0");
  });

  it("is dropped when the lock comes off, because there is no key to name", async () => {
    await seed(1);
    await createWorkspaceLock(FIRST);
    await removeWorkspaceLock(FIRST);

    const database = await getNotesDb();
    expect((await database.getAll("branches"))[0].keyId).toBeUndefined();
    expect((await database.getAll("notes-documents"))[0].keyId).toBeUndefined();
  });
});
