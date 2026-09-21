// @vitest-environment node
//
// Node, not jsdom: the rekey pass reads media back out of stored Blobs, and fake-indexeddb
// flattens a jsdom Blob into a bare object with no arrayBuffer(). Node's Blob survives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveCipher, resetActiveCipher } from "./cipher";
import { PBKDF2_ITERATIONS } from "./crypto-envelope";
import { getNotesDb } from "./notes-db";
import { loadNotesDocument, saveLinearDocumentPayload } from "./notes-document-storage";
import {
  createWorkspaceLock,
  getWorkspaceLockState,
  isWorkspaceLockSet,
  lockWorkspace,
  removeWorkspaceLock,
  unlockWorkspace,
} from "./workspace-lock";

const PASSPHRASE = "correct horse battery";
const NOTE_TEXT = "SECRET-MARKER lecture notes";

// The shipped 600,000 iterations would make every one of these take seconds.
vi.mock("./crypto-envelope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./crypto-envelope")>()),
  PBKDF2_ITERATIONS: 100,
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

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("workspace-keys"),
    database.clear("notes-documents"),
    database.clear("notes-media"),
    database.clear("notes-directory"),
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

    expect(record).toMatchObject({
      id: "workspace",
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS },
    });
    expect(record?.verifier).not.toHaveLength(0);
    expect(JSON.stringify(record)).not.toContain(PASSPHRASE);
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

describe("removeWorkspaceLock", () => {
  it("writes everything back as plaintext, so nobody is trapped behind it", async () => {
    await seedNote();
    await seedImage();
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();

    expect(await removeWorkspaceLock(PASSPHRASE)).toBe(true);

    expect(await isWorkspaceLockSet()).toBe(false);
    expect(await getWorkspaceLockState()).toBe("unset");
    expect(await storedText("doc-1")).toBe(NOTE_TEXT);
    expect(await storedImage("media-1")).toBe("IMAGE-MARKER");
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
