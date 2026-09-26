import { describe, expect, it } from "vitest";

import { unwrapWingKey, wrapWingKey } from "./wing-key";

async function accountKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "wrapKey",
    "unwrapKey",
  ]);
}

async function wingKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

describe("the wing key, sealed under the account key", () => {
  it("comes back able to open what it sealed", async () => {
    const account = await accountKey();
    const wing = await wingKey();
    const iv = new Uint8Array(12).fill(7);
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      wing,
      new TextEncoder().encode("a note"),
    );

    const reopened = await unwrapWingKey(await wrapWingKey(wing, account), account);
    const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, reopened!, sealed);

    expect(new TextDecoder().decode(opened)).toBe("a note");
  });

  it("gives nothing to the wrong account key", async () => {
    const wrapped = await wrapWingKey(await wingKey(), await accountKey());

    expect(await unwrapWingKey(wrapped, await accountKey())).toBeNull();
  });

  it("gives nothing for bytes that are not a wrap", async () => {
    // AES-GCM authenticates, so tampering is a failed tag check rather than a key that
    // would go on to decrypt rubbish.
    expect(await unwrapWingKey("bm90IGEgd3JhcA", await accountKey())).toBeNull();
  });
});
