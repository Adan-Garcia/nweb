import { beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "../db/notes-db";
import {
  clearRekeyJournal,
  passphrasesNeeded,
  readRekeyJournal,
  REKEY_JOURNAL_ID,
  type RekeyJournal,
  writeRekeyJournal,
} from "./rekey-journal";

const KDF = {
  name: "Argon2id",
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  salt: "AAAA",
} as const;

const JOURNAL: RekeyJournal = {
  id: REKEY_JOURNAL_ID,
  source: null,
  target: { kdf: KDF, keyId: "a-key", verifier: "AAAA" },
  store: "notes-documents",
  lastKey: null,
  done: 0,
  total: 10,
  startedAt: 1,
};

beforeEach(async () => {
  const database = await getNotesDb();
  await database.clear("workspace-rekey");
});

describe("the rekey journal", () => {
  it("is absent until one is written, and gone once cleared", async () => {
    expect(await readRekeyJournal()).toBeNull();

    await writeRekeyJournal(JOURNAL);
    expect(await readRekeyJournal()).toEqual(JOURNAL);

    await clearRekeyJournal();
    expect(await readRekeyJournal()).toBeNull();
  });

  it("refuses a row this version cannot read, rather than reporting no rekey", async () => {
    const database = await getNotesDb();
    // A journal whose KDF cost is not a cost. Treating a row it cannot make sense of as
    // "nothing to finish" would hand the workspace back half-converted and let it be
    // written to.
    await database.put("workspace-rekey", {
      ...JOURNAL,
      target: { kdf: { ...KDF, memorySize: 0 }, keyId: "a-key", verifier: "AAAA" },
    });

    await expect(readRekeyJournal()).rejects.toThrow(/not one this version can read/);
  });
});

describe("passphrasesNeeded", () => {
  it("asks for the new one when a workspace was being locked for the first time", () => {
    expect(passphrasesNeeded(JOURNAL)).toEqual(["target"]);
  });

  it("asks for the old one when it was being unlocked for good", () => {
    expect(
      passphrasesNeeded({
        ...JOURNAL,
        source: { kdf: KDF, keyId: "a-key", verifier: "AAAA" },
        target: null,
      }),
    ).toEqual(["source"]);
  });

  it("asks for both when it was moving between two, because half the rows are under each", () => {
    expect(
      passphrasesNeeded({ ...JOURNAL, source: { kdf: KDF, keyId: "a-key", verifier: "AAAA" } }),
    ).toEqual(["source", "target"]);
  });
});
