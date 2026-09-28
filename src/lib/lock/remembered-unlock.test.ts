import { unwrap } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "../db/notes-db";
import {
  forgetRememberedUnlock,
  readRememberedUnlock,
  REMEMBER_DAYS,
  rememberAccountUnlock,
  rememberLockUnlock,
} from "./remembered-unlock";

const NOW = Date.UTC(2026, 8, 28);
const DAY = 24 * 60 * 60 * 1000;

function aesKey(extractable: boolean) {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

async function rsaPrivateKey() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  return pair.privateKey;
}

beforeEach(async () => {
  await (await getNotesDb()).clear("remembered-unlock");
});

describe("remembered unlock", () => {
  it("keeps a lock's key, usable and no longer exportable, for the days it promises", async () => {
    await rememberLockUnlock({ key: await aesKey(true), keyId: "lock-1" }, NOW);

    const remembered = await readRememberedUnlock(NOW + (REMEMBER_DAYS - 1) * DAY);

    expect(remembered).toMatchObject({ kind: "lock", keyId: "lock-1" });
    if (remembered?.kind !== "lock") {
      throw new Error("expected a lock");
    }
    expect(remembered.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", remembered.key)).rejects.toThrow();

    // Still the same key: it opens what the original sealed.
    const iv = new Uint8Array(12);
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      remembered.key,
      new TextEncoder().encode("hello"),
    );
    expect(sealed.byteLength).toBeGreaterThan(0);
  });

  it("keeps an account's keys and sign-in proof, the keys sealed the same way", async () => {
    await rememberAccountUnlock(
      {
        wingKey: await aesKey(true),
        wingKeyId: "wing-1",
        privateKey: await rsaPrivateKey(),
        authKey: "proof",
      },
      NOW,
    );

    const remembered = await readRememberedUnlock(NOW);

    expect(remembered).toMatchObject({ kind: "account", wingKeyId: "wing-1", authKey: "proof" });
    if (remembered?.kind !== "account") {
      throw new Error("expected an account");
    }
    expect(remembered.wingKey.extractable).toBe(false);
    expect(remembered.privateKey.extractable).toBe(false);
    expect(remembered.privateKey.usages).toEqual(["decrypt"]);
  });

  it("stores a key that is already sealed as it is", async () => {
    const key = await aesKey(false);

    await rememberLockUnlock({ key, keyId: "lock-1" }, NOW);

    expect((await readRememberedUnlock(NOW))?.kind).toBe("lock");
  });

  it("lapses after the days it promises, and is gone once it has", async () => {
    await rememberLockUnlock({ key: await aesKey(false), keyId: "lock-1" }, NOW);

    expect(await readRememberedUnlock(NOW + REMEMBER_DAYS * DAY)).toBeNull();
    expect(await (await getNotesDb()).count("remembered-unlock")).toBe(0);
  });

  it("forgets a row it cannot read, and is null when there is none", async () => {
    expect(await readRememberedUnlock(NOW)).toBeNull();

    // Written past the typed wrapper: a row missing its key is refused rather than trusted.
    const raw = unwrap(await getNotesDb());

    await new Promise((resolve, reject) => {
      const request = raw
        .transaction("remembered-unlock", "readwrite")
        .objectStore("remembered-unlock")
        .put({ id: "self", kind: "lock", expiresAt: NOW + DAY, keyId: "lock-1" });

      request.onsuccess = resolve;
      request.onerror = reject;
    });

    expect(await readRememberedUnlock(NOW)).toBeNull();
    expect(await (await getNotesDb()).count("remembered-unlock")).toBe(0);
  });

  it("forgets on request", async () => {
    await rememberLockUnlock({ key: await aesKey(false), keyId: "lock-1" }, NOW);
    await forgetRememberedUnlock();

    expect(await readRememberedUnlock(NOW)).toBeNull();
  });
});
