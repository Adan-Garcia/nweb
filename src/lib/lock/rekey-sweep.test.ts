import { describe, expect, it } from "vitest";

import { createAesGcmCipher, plaintextCipher } from "../crypto/cipher";
import { alreadyMoved } from "./rekey-sweep";

async function aesCipher(keyId: string) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

  return createAesGcmCipher(key, keyId);
}

describe("alreadyMoved", () => {
  it("is true for a row a previous run of this same rekey converted", async () => {
    const to = await aesCipher("key-b");

    expect(alreadyMoved({ encryption: "aes-gcm", keyId: "key-b" }, to)).toBe(true);
  });

  it("is false for a row still under the key being moved away from", async () => {
    const to = await aesCipher("key-b");

    // The case an id exists for: both sides say aes-gcm, so the name alone cannot answer.
    expect(alreadyMoved({ encryption: "aes-gcm", keyId: "key-a" }, to)).toBe(false);
  });

  it("is false for a row that has never been sealed", async () => {
    const to = await aesCipher("key-b");

    expect(alreadyMoved({}, to)).toBe(false);
  });

  it("is true for a plaintext row when plaintext is where the rewrite is going", () => {
    expect(alreadyMoved({}, plaintextCipher)).toBe(true);
  });

  it("is false for a sealed row when the rewrite is unsealing", () => {
    expect(alreadyMoved({ encryption: "aes-gcm", keyId: "key-a" }, plaintextCipher)).toBe(false);
  });

  it("is false when the id matches but the cipher does not", async () => {
    const to = await aesCipher("");

    // A row with no id and no marker against a key that somehow has no id either: the
    // names still have to agree, or a plaintext row would count as sealed.
    expect(alreadyMoved({}, to)).toBe(false);
  });
});
