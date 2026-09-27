import { beforeEach, describe, expect, it } from "vitest";

import { resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb, getNotesDb } from "../db/notes-db";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { forgetKeyring } from "../keys/object-keys";
import { readLockRecord } from "../lock/workspace-lock";
import { createWorkspaceLock } from "../lock/workspace-passphrase";
import { createNotesDirectoryEntry } from "../notes/notes-directory-storage";
import { clearWorkspaceData, dropRowsUnderKeys, hasWorkspaceContent } from "./workspace-data";

beforeEach(async () => {
  resetActiveCipher();
  forgetKeyring();
  await eraseNotesDb();
});

async function writeNote() {
  const { path } = await ensureDefaultWorkspace();

  return createNotesDirectoryEntry({ branchId: path.branch.id, feather: "Mitosis" });
}

describe("workspace data", () => {
  it("counts a note as content, but not a deleted one or the scaffolding", async () => {
    expect(await hasWorkspaceContent()).toBe(false);

    await ensureDefaultWorkspace();
    expect(await hasWorkspaceContent()).toBe(false);

    const note = await writeNote();
    expect(await hasWorkspaceContent()).toBe(true);

    const database = await getNotesDb();
    await database.put("notes-directory", { ...note, deletedAt: 5 });
    expect(await hasWorkspaceContent()).toBe(false);
  });

  it("empties what syncs and leaves who may open it", async () => {
    await createWorkspaceLock("correct horse battery");
    await writeNote();

    await clearWorkspaceData();

    const database = await getNotesDb();
    expect(await database.count("notes-directory")).toBe(0);
    expect(await database.count("wings")).toBe(0);
    expect(await readLockRecord()).toBeDefined();
  });

  it("drops exactly the rows sealed under the keys it is given", async () => {
    await createWorkspaceLock("correct horse battery");
    await writeNote();
    const keyId = (await readLockRecord())?.keyId ?? "";

    expect(await dropRowsUnderKeys(new Set())).toBe(0);
    expect(await dropRowsUnderKeys(new Set(["some-other-key"]))).toBe(0);
    expect(await dropRowsUnderKeys(new Set([keyId]))).toBeGreaterThan(0);
    expect(await (await getNotesDb()).count("notes-directory")).toBe(0);
  });
});
