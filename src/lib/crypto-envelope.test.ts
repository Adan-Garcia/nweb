import { describe, expect, it } from "vitest";

import {
  ENCRYPTED_FORMAT,
  isEncryptedEnvelope,
  openWithPassphrase,
  PBKDF2_ITERATIONS,
  sealWithPassphrase,
} from "./crypto-envelope";

// A low iteration count: these tests are about the shape and the failure modes, not about
// how long a derivation takes. The real count is asserted on its own below.
const FAST = 100;

describe("sealWithPassphrase", () => {
  it("round-trips the plaintext under the right passphrase", async () => {
    const envelope = await sealWithPassphrase("the quick brown fox", "correct horse", FAST);

    expect(await openWithPassphrase(envelope, "correct horse")).toBe("the quick brown fox");
  });

  it("round-trips text that is not ASCII", async () => {
    const text = "Notes — “smart quotes”, an emoji 🪶 and 日本語.";
    const envelope = await sealWithPassphrase(text, "pw", FAST);

    expect(await openWithPassphrase(envelope, "pw")).toBe(text);
  });

  it("keeps the plaintext out of the envelope", async () => {
    const envelope = await sealWithPassphrase("SECRET-MARKER", "pw", FAST);

    expect(JSON.stringify(envelope)).not.toContain("SECRET-MARKER");
  });

  it("records everything needed to open it again, so an old file stays readable", async () => {
    const envelope = await sealWithPassphrase("text", "pw", FAST);

    expect(envelope).toMatchObject({
      format: ENCRYPTED_FORMAT,
      version: 1,
      cipher: "AES-GCM",
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: FAST },
    });
    expect(envelope.kdf.salt).not.toHaveLength(0);
    expect(envelope.iv).not.toHaveLength(0);
  });

  it("uses a fresh salt and IV each time, which AES-GCM depends on", async () => {
    const first = await sealWithPassphrase("same text", "same passphrase", FAST);
    const second = await sealWithPassphrase("same text", "same passphrase", FAST);

    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.iv).not.toBe(second.iv);
    // And so the same input under the same passphrase never produces the same bytes.
    expect(first.data).not.toBe(second.data);
  });

  it("defaults to an iteration count worth having", () => {
    // Not a round number by accident: OWASP's 2023 floor for PBKDF2-HMAC-SHA256.
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });
});

describe("openWithPassphrase", () => {
  it("returns null for the wrong passphrase rather than throwing", async () => {
    const envelope = await sealWithPassphrase("text", "right", FAST);

    expect(await openWithPassphrase(envelope, "wrong")).toBeNull();
    expect(await openWithPassphrase(envelope, "")).toBeNull();
  });

  it("refuses a file whose ciphertext has been altered, because GCM authenticates", async () => {
    const envelope = await sealWithPassphrase("text", "pw", FAST);
    const bytes = [...atob(envelope.data)].map((char) => char.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered = { ...envelope, data: btoa(String.fromCharCode(...bytes)) };

    expect(await openWithPassphrase(tampered, "pw")).toBeNull();
  });

  it("refuses a file whose recorded salt has been swapped", async () => {
    const envelope = await sealWithPassphrase("text", "pw", FAST);
    const other = await sealWithPassphrase("text", "pw", FAST);

    expect(await openWithPassphrase({ ...envelope, kdf: other.kdf }, "pw")).toBeNull();
  });
});

describe("isEncryptedEnvelope", () => {
  it("recognises one, so a restore can ask for a passphrase instead of failing", async () => {
    expect(isEncryptedEnvelope(await sealWithPassphrase("text", "pw", FAST))).toBe(true);
  });

  it("rejects a plaintext backup and anything else", () => {
    expect(isEncryptedEnvelope({ format: "cuervo-planner-backup", version: 2 })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope("text")).toBe(false);
  });
});
