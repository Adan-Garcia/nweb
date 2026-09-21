// @vitest-environment node
//
// Node, not jsdom: the rekey pass reads media back out of stored Blobs, and fake-indexeddb
// flattens a jsdom Blob into a bare object with no arrayBuffer(). Node's Blob survives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveCipher, resetActiveCipher } from "./cipher";
import { createBranch, listBranches } from "./entity-storage";
import { getNotesDb } from "./notes-db";
import { loadNotesDocument, saveLinearDocumentPayload } from "./notes-document-storage";
import { createTwig, listTwigs } from "./twig-storage";
import {
  changeWorkspacePassphrase,
  createWorkspaceLock,
  getWorkspaceLockState,
  isWorkspaceLockSet,
  lockWorkspace,
  removeWorkspaceLock,
  unlockWorkspace,
} from "./workspace-lock";

const PASSPHRASE = "correct horse battery";
const NOTE_TEXT = "SECRET-MARKER lecture notes";

// 64 MiB and three passes is what ships; every one of these tests would pay it twice. The
// parameters travel in the lock record, so the cheap ones are used to unlock as well.
vi.mock("./kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id",
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

async function seedNote(id = "doc-1", text = NOTE_TEXT) {
  await saveLinearDocumentPayload({
    documentId: id,
    compressionAlgorithm: "none",
    compressed: new TextEncoder().encode(text),
  });
}

async function seedImage(id = "media-1", text = "IMAGE-MARKER") {
  const database = await getNotesDb();
  await database.put("notes-media", {
    id,
    blob: new Blob([new TextEncoder().encode(text)], { type: "image/webp" }),
    mimeType: "image/webp",
    created: 1,
    updatedAt: 1,
  });
}

const storedText = async (id: string) => {
  const database = await getNotesDb();
  const row = await database.get("notes-documents", id);

  return new TextDecoder().decode(row?.linearCompressed ?? new Uint8Array());
};

const storedImage = async (id: string) => {
  const database = await getNotesDb();
  const row = await database.get("notes-media", id);

  return new TextDecoder().decode(new Uint8Array((await row?.blob.arrayBuffer()) ?? []));
};

const storedBranchName = async (id: string) => {
  const database = await getNotesDb();

  return (await database.get("branches", id))?.name ?? "";
};

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("workspace-keys"),
    database.clear("notes-documents"),
    database.clear("notes-media"),
    database.clear("notes-directory"),
    database.clear("branches"),
    database.clear("twigs"),
  ]);
  resetActiveCipher();
});

afterEach(() => {
  resetActiveCipher();
});

describe("before a passphrase is chosen", () => {
  it("is unset, and what is stored is readable", async () => {
    await seedNote();

    expect(await getWorkspaceLockState()).toBe("unset");
    expect(await isWorkspaceLockSet()).toBe(false);
    expect(await storedText("doc-1")).toBe(NOTE_TEXT);
  });
});

describe("createWorkspaceLock", () => {
  it("encrypts what was already stored, which is the whole point of turning it on", async () => {
    await seedNote();
    await seedImage();

    await createWorkspaceLock(PASSPHRASE);

    // Neither the note nor the picture is readable in the database any more.
    expect(await storedText("doc-1")).not.toContain("SECRET-MARKER");
    expect(await storedImage("media-1")).not.toContain("IMAGE-MARKER");
    expect(await getWorkspaceLockState()).toBe("unlocked");
  });

  it("leaves the workspace unlocked, so the app keeps working straight afterwards", async () => {
    await seedNote();

    await createWorkspaceLock(PASSPHRASE);

    expect(getActiveCipher().name).toBe("aes-gcm");
    const loaded = await loadNotesDocument("doc-1");
    expect(new TextDecoder().decode(loaded?.document.linearCompressed ?? new Uint8Array())).toBe(
      NOTE_TEXT,
    );
  });

  it("records the KDF parameters and a verifier, and no content", async () => {
    await createWorkspaceLock(PASSPHRASE);

    const database = await getNotesDb();
    const record = await database.get("workspace-keys", "workspace");

    expect(record).toMatchObject({ id: "workspace", kdf: { name: "Argon2id" } });
    expect(record?.verifier).not.toHaveLength(0);
    expect(JSON.stringify(record)).not.toContain(PASSPHRASE);
  });

  it("encrypts the names the workspace is listed by, and none of the dates", async () => {
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createTwig({ branchId: branch.id, title: "Problem set 4", dueDate: "2026-10-01" });

    await createWorkspaceLock(PASSPHRASE);

    expect(await storedBranchName(branch.id)).not.toBe("Organic Chemistry");

    const database = await getNotesDb();
    const [stored] = await database.getAll("twigs");

    expect(stored.title).not.toBe("Problem set 4");
    expect(stored.encryption).toBe("aes-gcm");
    // What a server would need to say "something is due tomorrow" without being able to
    // say what. This is the line the lock deliberately does not cross.
    expect(stored.dueDate).toBe("2026-10-01");
    expect(stored.status).toBe("incomplete");
    expect(stored.createdAt).toBeGreaterThan(0);
  });

  it("reads those names back through the storage layer, which is where they are opened", async () => {
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createTwig({ branchId: branch.id, title: "Problem set 4" });

    await createWorkspaceLock(PASSPHRASE);

    expect((await listBranches())[0].name).toBe("Organic Chemistry");
    expect((await listTwigs())[0].title).toBe("Problem set 4");
  });

  it("refuses to list a name it cannot open, rather than showing its ciphertext", async () => {
    await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();

    await expect(listBranches()).rejects.toThrow(/not unlocked/);
  });

  it("refuses to set a second passphrase over the first", async () => {
    await createWorkspaceLock(PASSPHRASE);

    await expect(createWorkspaceLock("another")).rejects.toThrow(/already has a passphrase/);
  });
});

describe("locking and unlocking", () => {
  it("cannot read a note while locked, and can once unlocked", async () => {
    await seedNote();
    await createWorkspaceLock(PASSPHRASE);

    lockWorkspace();
    expect(await getWorkspaceLockState()).toBe("locked");
    await expect(loadNotesDocument("doc-1")).rejects.toThrow();

    expect(await unlockWorkspace(PASSPHRASE)).toBe(true);
    expect(await getWorkspaceLockState()).toBe("unlocked");

    const loaded = await loadNotesDocument("doc-1");
    expect(new TextDecoder().decode(loaded?.document.linearCompressed ?? new Uint8Array())).toBe(
      NOTE_TEXT,
    );
  });

  it("refuses the wrong passphrase and stays locked", async () => {
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();

    expect(await unlockWorkspace("wrong")).toBe(false);
    expect(await unlockWorkspace("")).toBe(false);
    expect(await getWorkspaceLockState()).toBe("locked");
  });

  it("cannot unlock a workspace that has no passphrase", async () => {
    expect(await unlockWorkspace(PASSPHRASE)).toBe(false);
  });

  it("keeps an image readable through a lock and unlock", async () => {
    // Turning the sealed bytes back into a data URL needs FileReader, which Node has not
    // got, so this stops at "the bytes come back"; the rest is covered end to end.
    await seedImage();
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();
    await unlockWorkspace(PASSPHRASE);

    const database = await getNotesDb();
    const row = await database.get("notes-media", "media-1");
    const opened = await getActiveCipher().decrypt(new Uint8Array(await row!.blob.arrayBuffer()));

    expect(row?.encryption).toBe("aes-gcm");
    expect(new TextDecoder().decode(opened)).toBe("IMAGE-MARKER");
  });
});

describe("changeWorkspacePassphrase", () => {
  it("moves the workspace to the new passphrase in one pass", async () => {
    await seedNote();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createWorkspaceLock(PASSPHRASE);

    expect(await changeWorkspacePassphrase(PASSPHRASE, "second passphrase")).toBe(true);

    lockWorkspace();
    expect(await unlockWorkspace(PASSPHRASE)).toBe(false);
    expect(await unlockWorkspace("second passphrase")).toBe(true);

    const loaded = await loadNotesDocument("doc-1");
    expect(new TextDecoder().decode(loaded?.document.linearCompressed ?? new Uint8Array())).toBe(
      NOTE_TEXT,
    );
    expect((await listBranches()).find((row) => row.id === branch.id)?.name).toBe(
      "Organic Chemistry",
    );
  });

  it("never writes a readable row on the way, which remove-then-set would", async () => {
    await seedNote();
    await createWorkspaceLock(PASSPHRASE);

    await changeWorkspacePassphrase(PASSPHRASE, "second passphrase");

    expect(await storedText("doc-1")).not.toContain("SECRET-MARKER");
    expect(await isWorkspaceLockSet()).toBe(true);
  });

  it("keeps the lock's own age, because it is the same lock", async () => {
    await createWorkspaceLock(PASSPHRASE);
    const database = await getNotesDb();
    const before = await database.get("workspace-keys", "workspace");

    await changeWorkspacePassphrase(PASSPHRASE, "second passphrase");
    const after = await database.get("workspace-keys", "workspace");

    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.verifier).not.toBe(before?.verifier);
  });

  it("refuses the wrong current passphrase and changes nothing", async () => {
    await seedNote();
    await createWorkspaceLock(PASSPHRASE);

    expect(await changeWorkspacePassphrase("wrong", "second passphrase")).toBe(false);

    lockWorkspace();
    expect(await unlockWorkspace(PASSPHRASE)).toBe(true);
  });

  it("reports nothing to change when there is no passphrase", async () => {
    expect(await changeWorkspacePassphrase(PASSPHRASE, "second")).toBe(false);
  });
});

describe("removeWorkspaceLock", () => {
  it("writes everything back as plaintext, so nobody is trapped behind it", async () => {
    await seedNote();
    await seedImage();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();

    expect(await removeWorkspaceLock(PASSPHRASE)).toBe(true);

    expect(await isWorkspaceLockSet()).toBe(false);
    expect(await getWorkspaceLockState()).toBe("unset");
    expect(await storedText("doc-1")).toBe(NOTE_TEXT);
    expect(await storedImage("media-1")).toBe("IMAGE-MARKER");
    expect(await storedBranchName(branch.id)).toBe("Organic Chemistry");
  });

  it("refuses the wrong passphrase and changes nothing", async () => {
    await seedNote();
    await createWorkspaceLock(PASSPHRASE);

    expect(await removeWorkspaceLock("wrong")).toBe(false);
    expect(await isWorkspaceLockSet()).toBe(true);
    expect(await storedText("doc-1")).not.toContain("SECRET-MARKER");
  });

  it("reports nothing to remove when there is no passphrase", async () => {
    expect(await removeWorkspaceLock(PASSPHRASE)).toBe(false);
  });
});
