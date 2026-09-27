import { registerRequestSchema } from "@shared/account-contract";
import { describe, expect, it, vi } from "vitest";

import { base64ToBytes } from "../crypto/base64";
import {
  type AccountKeys,
  createAccountKeys,
  deriveAuthKey,
  openAccountKeys,
  resealAccountKeys,
} from "./account-keys";

// 64 MiB and three passes is what ships, and RSA keygen is not free either. The parameters
// travel with the account, so the cheap ones are used to open it again as well.
vi.mock("../crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id",
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

const PASSPHRASE = "correct horse battery staple";

/** Proves two account keys are the same key, without either being readable. */
async function sealsAndOpens(sealWith: AccountKeys, openWith: AccountKeys) {
  const secret = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = new Uint8Array(12).fill(4);
  const wrapped = await crypto.subtle.wrapKey("raw", secret, sealWith.accountKey, {
    name: "AES-GCM",
    iv,
  });

  try {
    await crypto.subtle.unwrapKey(
      "raw",
      wrapped,
      openWith.accountKey,
      { name: "AES-GCM", iv },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return true;
  } catch {
    return false;
  }
}

describe("createAccountKeys", () => {
  it("hands the server a proof and a pile of ciphertext, and nothing else", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);
    const request = { email: "a@example.com", ...enrolment.material, authKey: enrolment.authKey };

    expect(registerRequestSchema.safeParse(request).success).toBe(true);
    // The passphrase is in none of it, and neither is anything it would be derived to.
    expect(JSON.stringify(request)).not.toContain(PASSPHRASE);
  });

  it("does not send the key that opens the account", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);

    // The proof and the wrapping key come from the same bytes through different labels.
    // If the server could use one as the other, the whole arrangement would be theatre.
    const authKey = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(enrolment.authKey),
      "AES-GCM",
      false,
      ["unwrapKey"],
    );
    const sealed = base64ToBytes(enrolment.material.sealedAccountKey);

    await expect(
      crypto.subtle.unwrapKey(
        "raw",
        sealed.subarray(12),
        authKey,
        { name: "AES-GCM", iv: sealed.subarray(0, 12) },
        { name: "AES-GCM", length: 256 },
        true,
        ["wrapKey"],
      ),
    ).rejects.toThrow();
  });

  it("gives every account its own keys", async () => {
    const first = await createAccountKeys(PASSPHRASE);
    const second = await createAccountKeys(PASSPHRASE);

    expect(first.enrolment.material.publicKey).not.toBe(second.enrolment.material.publicKey);
    expect(first.enrolment.authKey).not.toBe(second.enrolment.authKey);
    expect(await sealsAndOpens(first.keys, second.keys)).toBe(false);
  });
});

describe("openAccountKeys", () => {
  it("opens on a device that has only the passphrase and what the server held", async () => {
    const { keys, enrolment } = await createAccountKeys(PASSPHRASE);

    const opened = await openAccountKeys(PASSPHRASE, enrolment.material);

    expect(opened).not.toBeNull();
    expect(await sealsAndOpens(keys, opened!)).toBe(true);
  });

  it("brings back an identity key that still matches its public half", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);
    const opened = await openAccountKeys(PASSPHRASE, enrolment.material);

    // What sharing will rest on: anyone can encrypt to the public key, and only the
    // recovered private key opens it.
    const publicKey = await crypto.subtle.importKey(
      "spki",
      base64ToBytes(enrolment.material.publicKey),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    const sealed = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      new TextEncoder().encode("a data key"),
    );

    const opened_ = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, opened!.privateKey, sealed);
    expect(new TextDecoder().decode(opened_)).toBe("a data key");
  });

  it("returns null for the wrong passphrase rather than half an account", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);

    expect(await openAccountKeys("wrong", enrolment.material)).toBeNull();
    expect(await openAccountKeys("", enrolment.material)).toBeNull();
  });

  it("returns null when the sealed material has been altered", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);
    const tampered = {
      ...enrolment.material,
      sealedAccountKey: `${enrolment.material.sealedAccountKey.slice(0, -4)}AAAA`,
    };

    expect(await openAccountKeys(PASSPHRASE, tampered)).toBeNull();
  });
});

describe("deriveAuthKey", () => {
  it("reproduces the proof from the passphrase and the recorded parameters", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);

    expect(await deriveAuthKey(PASSPHRASE, enrolment.material.kdf)).toBe(enrolment.authKey);
  });

  it("gives a different proof for a different passphrase", async () => {
    const { enrolment } = await createAccountKeys(PASSPHRASE);

    expect(await deriveAuthKey("something else", enrolment.material.kdf)).not.toBe(
      enrolment.authKey,
    );
  });
});

describe("resealAccountKeys", () => {
  it("changes the passphrase without touching what the account protects", async () => {
    const { keys, enrolment } = await createAccountKeys(PASSPHRASE);

    const next = await resealAccountKeys(keys, enrolment.material, "second passphrase entirely");

    const opened = await openAccountKeys("second passphrase entirely", next.material);
    expect(opened).not.toBeNull();
    // The same account key, so every note sealed under it is still readable and none of
    // them had to be rewritten.
    expect(await sealsAndOpens(keys, opened!)).toBe(true);
  });

  it("leaves the old passphrase unable to open it", async () => {
    const { keys, enrolment } = await createAccountKeys(PASSPHRASE);

    const next = await resealAccountKeys(keys, enrolment.material, "second passphrase entirely");

    expect(await openAccountKeys(PASSPHRASE, next.material)).toBeNull();
    expect(next.authKey).not.toBe(enrolment.authKey);
  });

  it("keeps the identity key, which is what other people already share with", async () => {
    const { keys, enrolment } = await createAccountKeys(PASSPHRASE);

    const next = await resealAccountKeys(keys, enrolment.material, "second passphrase entirely");

    expect(next.material.publicKey).toBe(enrolment.material.publicKey);
    expect(next.material.sealedPrivateKey).toBe(enrolment.material.sealedPrivateKey);
  });
});
