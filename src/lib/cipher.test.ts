import { afterEach, describe, expect, it } from "vitest";

import {
  cipherForRow,
  CipherUnavailableError,
  cipherWroteRow,
  createAesGcmCipher,
  createKeyId,
  decryptWith,
  getActiveCipher,
  isLockedError,
  plaintextCipher,
  registerCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";

async function makeKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (value: Uint8Array) => new TextDecoder().decode(value);

afterEach(() => {
  resetActiveCipher();
});

describe("plaintextCipher", () => {
  it("hands the bytes straight back, and says it did nothing", async () => {
    const input = bytes("notes");

    expect(plaintextCipher.name).toBe("none");
    expect(await plaintextCipher.encrypt(input)).toBe(input);
    expect(await plaintextCipher.decrypt(input)).toBe(input);
  });
});

describe("createAesGcmCipher", () => {
  it("round-trips a payload", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");
    const sealed = await cipher.encrypt(bytes("lecture notes"));

    expect(text(await cipher.decrypt(sealed))).toBe("lecture notes");
  });

  it("round-trips an empty payload", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");

    expect(await cipher.decrypt(await cipher.encrypt(bytes("")))).toHaveLength(0);
  });

  it("keeps the plaintext out of what gets stored", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");
    const sealed = await cipher.encrypt(bytes("SECRET-MARKER"));

    expect(text(sealed)).not.toContain("SECRET-MARKER");
  });

  it("uses a fresh IV per call, so the same note never stores the same bytes", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");

    const first = await cipher.encrypt(bytes("same"));
    const second = await cipher.encrypt(bytes("same"));

    expect([...first]).not.toEqual([...second]);
  });

  it("cannot read a payload sealed under a different key", async () => {
    const sealed = await createAesGcmCipher(await makeKey(), "test-key").encrypt(bytes("notes"));
    const other = createAesGcmCipher(await makeKey(), "test-key");

    await expect(other.decrypt(sealed)).rejects.toThrow();
  });
});

describe("the active cipher", () => {
  it("is the plaintext one until something swaps it, which is today's default", () => {
    expect(getActiveCipher()).toBe(plaintextCipher);
  });

  it("is swapped by unlocking and dropped by locking", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");

    setActiveCipher(cipher);
    expect(getActiveCipher()).toBe(cipher);

    resetActiveCipher();
    expect(getActiveCipher()).toBe(plaintextCipher);
  });
});

describe("decryptWith", () => {
  it("passes through a row that was written in plaintext", async () => {
    const input = bytes("written before any of this");

    expect(await decryptWith(input, { encryption: "none" })).toBe(input);
  });

  it("reads a row back with the cipher that is active", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "test-key");
    setActiveCipher(cipher);
    const sealed = await cipher.encrypt(bytes("notes"));

    expect(text(await decryptWith(sealed, { encryption: "aes-gcm" }))).toBe("notes");
  });

  it("refuses an encrypted row while locked, rather than returning ciphertext", async () => {
    const sealed = await createAesGcmCipher(await makeKey(), "test-key").encrypt(bytes("notes"));

    // Returning the raw bytes would hand the editor ciphertext, and autosave would then
    // write it back as if it were the note.
    await expect(decryptWith(sealed, { encryption: "aes-gcm" })).rejects.toBeInstanceOf(
      CipherUnavailableError,
    );
  });
});

describe("isLockedError", () => {
  it("recognises the one failure a page's data hook should treat as nothing to load", () => {
    expect(isLockedError(new CipherUnavailableError("aes-gcm"))).toBe(true);
  });

  it("does not swallow anything else", () => {
    expect(isLockedError(new Error("the database is gone"))).toBe(false);
    expect(isLockedError("not an error at all")).toBe(false);
  });
});

describe("cipherWroteRow", () => {
  it("accepts a row this key sealed", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "key-a");

    expect(cipherWroteRow({ encryption: "aes-gcm", keyId: "key-a" }, cipher)).toBe(true);
  });

  it("refuses a row another key sealed, which is what an id is for", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "key-a");

    // Both say aes-gcm. Before ids there was no way to tell these apart, and a passphrase
    // change produces exactly this pair.
    expect(cipherWroteRow({ encryption: "aes-gcm", keyId: "key-b" }, cipher)).toBe(false);
  });

  it("refuses a row sealed with a cipher this one is not", async () => {
    expect(cipherWroteRow({ encryption: "aes-gcm", keyId: "key-a" }, plaintextCipher)).toBe(false);
    const cipher = createAesGcmCipher(await makeKey(), "key-a");
    expect(cipherWroteRow({ encryption: "none" }, cipher)).toBe(false);
  });

  it("takes a row with no id at its word, because it predates ids", async () => {
    const cipher = createAesGcmCipher(await makeKey(), "key-a");

    expect(cipherWroteRow({ encryption: "aes-gcm" }, cipher)).toBe(true);
  });

  it("treats an absent marker as plaintext", () => {
    expect(cipherWroteRow({}, plaintextCipher)).toBe(true);
  });
});

describe("createKeyId", () => {
  it("gives a different id every time", () => {
    expect(createKeyId()).not.toBe(createKeyId());
  });
});

describe("the keyring", () => {
  it("opens a row with whichever registered key sealed it", async () => {
    const mine = createAesGcmCipher(await makeKey(), "my-key");
    const shared = createAesGcmCipher(await makeKey(), "a-branch-someone-shared");

    setActiveCipher(mine);
    registerCipher(shared);

    // A note in a shared course was sealed by its own key, not by this workspace's.
    const sealed = await shared.encrypt(bytes("their note"));
    const opened = await decryptWith(sealed, { encryption: "aes-gcm", keyId: shared.keyId });

    expect(text(opened)).toBe("their note");
  });

  it("still refuses a row whose key it does not hold", async () => {
    setActiveCipher(createAesGcmCipher(await makeKey(), "my-key"));

    await expect(
      decryptWith(bytes("whatever"), { encryption: "aes-gcm", keyId: "a-key-nobody-gave-me" }),
    ).rejects.toBeInstanceOf(CipherUnavailableError);
  });

  it("takes an explicit cipher as this one and no other", async () => {
    const mine = createAesGcmCipher(await makeKey(), "my-key");
    const shared = createAesGcmCipher(await makeKey(), "shared-key");

    setActiveCipher(mine);
    registerCipher(shared);

    const sealed = await shared.encrypt(bytes("their note"));

    // A rekey moves rows between two named keys and must not quietly accept a third,
    // however many the keyring happens to hold.
    await expect(
      decryptWith(sealed, { encryption: "aes-gcm", keyId: shared.keyId }, mine),
    ).rejects.toBeInstanceOf(CipherUnavailableError);
  });

  it("forgets every key when the workspace locks, not just the active one", async () => {
    const shared = createAesGcmCipher(await makeKey(), "shared-key");

    setActiveCipher(createAesGcmCipher(await makeKey(), "my-key"));
    registerCipher(shared);
    resetActiveCipher();

    expect(cipherForRow({ encryption: "aes-gcm", keyId: shared.keyId })).toBeNull();
  });

  it("ignores a key with no id, because nothing could ask for it back", () => {
    registerCipher(plaintextCipher);

    expect(cipherForRow({ encryption: "aes-gcm", keyId: "" })).toBeNull();
  });
});

describe("cipherForRow", () => {
  it("answers the plaintext cipher for a row that was never sealed", () => {
    expect(cipherForRow({})).toBe(plaintextCipher);
    expect(cipherForRow({ encryption: "none" })).toBe(plaintextCipher);
  });

  it("answers the active cipher for a row written before keys had ids", async () => {
    const mine = createAesGcmCipher(await makeKey(), "my-key");

    setActiveCipher(mine);

    // There was one key when that row was written, so naming it would have been redundant.
    expect(cipherForRow({ encryption: "aes-gcm" })).toBe(mine);
  });

  it("answers nothing for an unmarked row when the workspace is locked", () => {
    expect(cipherForRow({ encryption: "aes-gcm" })).toBeNull();
  });
});
