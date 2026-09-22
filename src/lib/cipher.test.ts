import { afterEach, describe, expect, it } from "vitest";

import {
  CipherUnavailableError,
  cipherWroteRow,
  createAesGcmCipher,
  createKeyId,
  decryptWith,
  getActiveCipher,
  isLockedError,
  plaintextCipher,
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
