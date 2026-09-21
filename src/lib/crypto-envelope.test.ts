import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "./base64";
import {
  ENCRYPTED_FORMAT,
  isEncryptedEnvelope,
  openWithPassphrase,
  sealWithPassphrase,
} from "./crypto-envelope";
import type { KdfParams } from "./kdf";

/**
 * Deliberately cheap parameters, and a fresh salt per call: these tests are about the
 * shape of an envelope and its failure modes, not about how long a derivation takes. What
 * the shipped cost actually is belongs to `kdf.test.ts`.
 */
function fastSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

const fastArgon2id = (): KdfParams => ({
  name: "Argon2id",
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  salt: fastSalt(),
});

const fastPbkdf2 = (): KdfParams => ({
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 100,
  salt: fastSalt(),
});

describe("sealWithPassphrase", () => {
  it("round-trips the plaintext under the right passphrase", async () => {
    const envelope = await sealWithPassphrase(
      "the quick brown fox",
      "correct horse",
      fastArgon2id(),
    );

    expect(await openWithPassphrase(envelope, "correct horse")).toBe("the quick brown fox");
  });

  it("round-trips text that is not ASCII", async () => {
    const text = "Notes — “smart quotes”, an emoji 🪶 and 日本語.";
    const envelope = await sealWithPassphrase(text, "pw", fastArgon2id());

    expect(await openWithPassphrase(envelope, "pw")).toBe(text);
  });

  it("keeps the plaintext out of the envelope", async () => {
    const envelope = await sealWithPassphrase("SECRET-MARKER", "pw", fastArgon2id());

    expect(JSON.stringify(envelope)).not.toContain("SECRET-MARKER");
  });

  it("records everything needed to open it again, so an old file stays readable", async () => {
    const envelope = await sealWithPassphrase("text", "pw", fastArgon2id());

    expect(envelope).toMatchObject({
      format: ENCRYPTED_FORMAT,
      version: 1,
      cipher: "AES-GCM",
      kdf: { name: "Argon2id", memorySize: 1024, iterations: 1, parallelism: 1 },
    });
    expect(envelope.kdf.salt).not.toHaveLength(0);
    expect(envelope.iv).not.toHaveLength(0);
  });

  it("uses a fresh IV each time, which AES-GCM depends on", async () => {
    const first = await sealWithPassphrase("same text", "same passphrase", fastArgon2id());
    const second = await sealWithPassphrase("same text", "same passphrase", fastArgon2id());

    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.iv).not.toBe(second.iv);
    // And so the same input under the same passphrase never produces the same bytes.
    expect(first.data).not.toBe(second.data);
  });
});

describe("a file written before Argon2id", () => {
  it("still opens, because the envelope says which KDF wrote it", async () => {
    const envelope = await sealWithPassphrase("older file", "pw", fastPbkdf2());

    expect(envelope.kdf.name).toBe("PBKDF2");
    expect(await openWithPassphrase(envelope, "pw")).toBe("older file");
  });

  it("is not opened by reading it as though it were the new one", async () => {
    const pbkdf2 = await sealWithPassphrase("text", "pw", fastPbkdf2());
    const argon = await sealWithPassphrase("text", "pw", fastArgon2id());

    expect(await openWithPassphrase({ ...pbkdf2, kdf: argon.kdf }, "pw")).toBeNull();
  });
});

describe("openWithPassphrase", () => {
  it("returns null for the wrong passphrase rather than throwing", async () => {
    const envelope = await sealWithPassphrase("text", "right", fastArgon2id());

    expect(await openWithPassphrase(envelope, "wrong")).toBeNull();
    expect(await openWithPassphrase(envelope, "")).toBeNull();
  });

  it("refuses a file whose ciphertext has been altered, because GCM authenticates", async () => {
    const envelope = await sealWithPassphrase("text", "pw", fastArgon2id());
    const bytes = [...atob(envelope.data)].map((char) => char.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered = { ...envelope, data: btoa(String.fromCharCode(...bytes)) };

    expect(await openWithPassphrase(tampered, "pw")).toBeNull();
  });

  it("refuses a file whose recorded salt has been swapped", async () => {
    const envelope = await sealWithPassphrase("text", "pw", fastArgon2id());
    const other = await sealWithPassphrase("text", "pw", fastArgon2id());

    expect(await openWithPassphrase({ ...envelope, kdf: other.kdf }, "pw")).toBeNull();
  });
});

describe("isEncryptedEnvelope", () => {
  it("recognises one, so a restore can ask for a passphrase instead of failing", async () => {
    expect(isEncryptedEnvelope(await sealWithPassphrase("text", "pw", fastArgon2id()))).toBe(true);
  });

  it("recognises one written by the build before Argon2id", async () => {
    expect(isEncryptedEnvelope(await sealWithPassphrase("text", "pw", fastPbkdf2()))).toBe(true);
  });

  it("rejects a plaintext backup and anything else", () => {
    expect(isEncryptedEnvelope({ format: "cuervo-planner-backup", version: 2 })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope("text")).toBe(false);
  });

  it("rejects an envelope naming a KDF this build cannot run", () => {
    expect(
      isEncryptedEnvelope({
        format: ENCRYPTED_FORMAT,
        version: 1,
        kdf: { name: "scrypt", salt: "AAAA", iterations: 1 },
        cipher: "AES-GCM",
        iv: "AAAA",
        data: "AAAA",
      }),
    ).toBe(false);
  });
});
