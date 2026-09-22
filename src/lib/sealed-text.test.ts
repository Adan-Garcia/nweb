import { afterEach, describe, expect, it } from "vitest";

import {
  createAesGcmCipher,
  getActiveCipher,
  plaintextCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";
import {
  openRow,
  openRows,
  openText,
  type SealedRow,
  sealRow,
  sealRows,
  sealText,
} from "./sealed-text";

type NamedRow = SealedRow & { id: string; name: string };
type TitledRow = SealedRow & { id: string; title: string; dueDate?: string; status?: string };

async function aesCipher() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

  return createAesGcmCipher(key, "test-key");
}

afterEach(() => {
  resetActiveCipher();
});

describe("sealText", () => {
  it("does nothing at all with no passphrase, so a plain workspace stores plain names", async () => {
    expect(await sealText("Organic Chemistry", plaintextCipher)).toBe("Organic Chemistry");
  });

  it("round-trips through the cipher that wrote it", async () => {
    const cipher = await aesCipher();
    const sealed = await sealText("Organic Chemistry", cipher);

    expect(sealed).not.toBe("Organic Chemistry");
    expect(await openText(sealed, { encryption: "aes-gcm" }, cipher)).toBe("Organic Chemistry");
  });

  it("round-trips a name that is not ASCII", async () => {
    const cipher = await aesCipher();
    const name = "Física — 物理 🪶";

    expect(await openText(await sealText(name, cipher), { encryption: "aes-gcm" }, cipher)).toBe(
      name,
    );
  });

  it("seals the same name to different bytes each time, so the store is no lookup table", async () => {
    const cipher = await aesCipher();

    expect(await sealText("Organic Chemistry", cipher)).not.toBe(
      await sealText("Organic Chemistry", cipher),
    );
  });
});

describe("openText", () => {
  it("passes an unmarked name through, which is what a row written before this reads as", async () => {
    expect(await openText("Organic Chemistry", {})).toBe("Organic Chemistry");
    expect(await openText("Organic Chemistry", { encryption: "none" })).toBe("Organic Chemistry");
  });

  it("refuses a name the active cipher did not write, rather than returning its ciphertext", async () => {
    const wrote = await aesCipher();
    const sealed = await sealText("Organic Chemistry", wrote);

    setActiveCipher(plaintextCipher);
    await expect(openText(sealed, { encryption: "aes-gcm" })).rejects.toThrow(/not unlocked/);
  });
});

describe("sealRow", () => {
  it("stamps the row with the cipher that wrote it", async () => {
    const cipher = await aesCipher();
    const row: NamedRow = { id: "1", name: "Organic Chemistry" };
    const sealed = await sealRow(row, "name", cipher);

    expect(sealed.encryption).toBe("aes-gcm");
    expect(sealed.name).not.toBe("Organic Chemistry");
    expect(sealed.id).toBe("1");
  });

  it("uses the active cipher when it is not given one", async () => {
    setActiveCipher(await aesCipher());
    const row: TitledRow = { id: "1", title: "Problem set 4" };
    const sealed = await sealRow(row, "title");

    expect(sealed.encryption).toBe(getActiveCipher().name);
    expect(await openRow(sealed, "title")).toMatchObject({ title: "Problem set 4" });
  });

  it("leaves every other field of the row alone", async () => {
    const cipher = await aesCipher();
    const row: TitledRow = {
      id: "1",
      title: "Problem set 4",
      dueDate: "2026-10-01",
      status: "incomplete",
    };
    const sealed = await sealRow(row, "title", cipher);

    expect(sealed).toMatchObject({ dueDate: "2026-10-01", status: "incomplete" });
  });
});

describe("openRow", () => {
  it("takes the marker off, so a row written back is never plaintext labelled as sealed", async () => {
    const cipher = await aesCipher();
    const row: NamedRow = { id: "1", name: "Organic Chemistry" };
    const opened = await openRow(await sealRow(row, "name", cipher), "name", cipher);

    expect(opened.name).toBe("Organic Chemistry");
    expect(opened.encryption).toBeUndefined();
  });
});

describe("sealRows and openRows", () => {
  it("round-trip a list", async () => {
    const cipher = await aesCipher();
    const rows: NamedRow[] = [
      { id: "1", name: "Organic Chemistry" },
      { id: "2", name: "Linear Algebra" },
    ];

    const sealed = await sealRows(rows, "name", cipher);
    expect(sealed.map((row) => row.name)).not.toContain("Linear Algebra");

    expect(await openRows(sealed, "name", cipher)).toEqual([
      { id: "1", name: "Organic Chemistry", encryption: undefined },
      { id: "2", name: "Linear Algebra", encryption: undefined },
    ]);
  });
});
