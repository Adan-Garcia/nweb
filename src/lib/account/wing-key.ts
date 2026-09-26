import { base64ToBytes, bytesToBase64 } from "../base64";

/**
 * The workspace's own root key, sealed under the account key.
 *
 * Its own file because it is the hinge of the whole design: the passphrase opens the
 * account key, the account key opens this, and this opens the workspace. Changing a
 * passphrase re-wraps the account key and leaves this untouched; sharing a course wraps a
 * key *below* this and leaves it untouched too. Nothing else has to know that.
 */
const IV_BYTES = 12;

const WING_KEY_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const WING_KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];

/** The IV is prefixed to the wrapped bytes, as it is everywhere else here. */
export async function wrapWingKey(wingKey: CryptoKey, accountKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey("raw", wingKey, accountKey, { name: "AES-GCM", iv }),
  );
  const payload = new Uint8Array(IV_BYTES + wrapped.byteLength);

  payload.set(iv, 0);
  payload.set(wrapped, IV_BYTES);

  return bytesToBase64(payload);
}

/**
 * Null is a wrong account key or bytes that have been tampered with; AES-GCM authenticates,
 * so the two are the same failure and neither produces a key that would go on to decrypt
 * rubbish.
 */
export async function unwrapWingKey(
  wrapped: string,
  accountKey: CryptoKey,
): Promise<CryptoKey | null> {
  try {
    const payload = base64ToBytes(wrapped);

    return await crypto.subtle.unwrapKey(
      "raw",
      payload.subarray(IV_BYTES),
      accountKey,
      { name: "AES-GCM", iv: payload.subarray(0, IV_BYTES) },
      WING_KEY_ALGORITHM,
      true,
      WING_KEY_USAGES,
    );
  } catch {
    return null;
  }
}
