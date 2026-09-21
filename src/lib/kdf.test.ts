import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  ARGON2ID_DEFAULTS,
  createKdfParams,
  deriveKey,
  type KdfParams,
  kdfParamsSchema,
} from "./kdf";

const SALT = bytesToBase64(new Uint8Array(16).fill(7));

const cheapArgon2id: KdfParams = {
  name: "Argon2id",
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  salt: SALT,
};

const cheapPbkdf2: KdfParams = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 100,
  salt: SALT,
};

/** Keys are not extractable, so two are compared by what one seals and the other opens. */
async function sealsAndOpens(sealWith: CryptoKey, openWith: CryptoKey) {
  const iv = new Uint8Array(12).fill(3);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sealWith,
    new TextEncoder().encode("marker"),
  );

  try {
    const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, openWith, sealed);
    return new TextDecoder().decode(opened) === "marker";
  } catch {
    return false;
  }
}

describe("createKdfParams", () => {
  it("chooses Argon2id at OWASP's 2023 cost, which is what memory-hardness is for", () => {
    expect(createKdfParams()).toMatchObject({
      name: "Argon2id",
      memorySize: 65_536,
      iterations: 3,
      parallelism: 1,
    });
    expect(ARGON2ID_DEFAULTS.memorySize).toBe(65_536);
  });

  it("takes a fresh salt every time", () => {
    expect(createKdfParams().salt).not.toBe(createKdfParams().salt);
    expect(base64ToBytes(createKdfParams().salt)).toHaveLength(16);
  });
});

describe("deriveKey", () => {
  it("is deterministic, so the same passphrase opens what it sealed", async () => {
    const first = await deriveKey("pw", cheapArgon2id);
    const second = await deriveKey("pw", cheapArgon2id);

    expect(await sealsAndOpens(first, second)).toBe(true);
  });

  it("gives a different key for a different passphrase", async () => {
    const right = await deriveKey("pw", cheapArgon2id);
    const wrong = await deriveKey("other", cheapArgon2id);

    expect(await sealsAndOpens(right, wrong)).toBe(false);
  });

  it("gives a different key for a different salt", async () => {
    const first = await deriveKey("pw", cheapArgon2id);
    const second = await deriveKey("pw", {
      ...cheapArgon2id,
      salt: bytesToBase64(new Uint8Array(16)),
    });

    expect(await sealsAndOpens(first, second)).toBe(false);
  });

  it("gives a different key for a different cost, so raising one is not a silent no-op", async () => {
    const cheap = await deriveKey("pw", cheapArgon2id);
    const dearer = await deriveKey("pw", { ...cheapArgon2id, iterations: 2 });

    expect(await sealsAndOpens(cheap, dearer)).toBe(false);
  });

  it("still runs PBKDF2 for material recorded before Argon2id", async () => {
    const first = await deriveKey("pw", cheapPbkdf2);
    const second = await deriveKey("pw", cheapPbkdf2);

    expect(await sealsAndOpens(first, second)).toBe(true);
  });

  it("does not produce the same key from the two KDFs", async () => {
    const argon = await deriveKey("pw", cheapArgon2id);
    const pbkdf2 = await deriveKey("pw", cheapPbkdf2);

    expect(await sealsAndOpens(argon, pbkdf2)).toBe(false);
  });
});

describe("kdfParamsSchema", () => {
  it("accepts both shapes", () => {
    expect(kdfParamsSchema.safeParse(cheapArgon2id).success).toBe(true);
    expect(kdfParamsSchema.safeParse(cheapPbkdf2).success).toBe(true);
  });

  it("rejects a KDF this build cannot run, rather than guessing at it", () => {
    expect(kdfParamsSchema.safeParse({ name: "scrypt", salt: SALT }).success).toBe(false);
    expect(kdfParamsSchema.safeParse({ ...cheapArgon2id, memorySize: 0 }).success).toBe(false);
    expect(kdfParamsSchema.safeParse({ ...cheapPbkdf2, hash: "SHA-1" }).success).toBe(false);
  });
});
