import type { KeyGraph, KeyKind } from "@shared/sharing-contract";

import { base64ToBytes, bytesToBase64 } from "../base64";
import { type Cipher, createAesGcmCipher } from "../cipher";

/**
 * Walking the key graph: from a private key, through the grants it opens, down the wraps,
 * to every key this device can derive.
 *
 * The walk is breadth-first over a graph rather than a tree, because a nest is a tag: a
 * note in two of them is reachable two ways, and either route has to be enough. A key
 * reached twice is unwrapped once.
 *
 * Nothing here trusts the shape it was handed. A wrap whose parent cannot be derived is
 * skipped, and one that will not open is skipped too — a server that sent a wrap it should
 * not have gains nothing by it, because the bytes are only bytes without the key above.
 */
const IV_BYTES = 12;

export type Keyring = Map<string, CryptoKey>;

export type ObjectKey = { keyId: string; key: CryptoKey; kind: KeyKind };

/** A fresh key for one object, extractable so it can be wrapped for a parent or a person. */
export async function createObjectKey(kind: KeyKind): Promise<ObjectKey> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);

  return { keyId: crypto.randomUUID(), key, kind };
}

/** Seals a child key under its parent's. The IV is prefixed, as everywhere else here. */
export async function wrapUnderParent(child: CryptoKey, parent: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey("raw", child, parent, { name: "AES-GCM", iv }),
  );
  const payload = new Uint8Array(IV_BYTES + wrapped.byteLength);

  payload.set(iv, 0);
  payload.set(wrapped, IV_BYTES);

  return bytesToBase64(payload);
}

/** Seals a key for someone else, against the public key their account published. */
export async function wrapForRecipient(key: CryptoKey, publicKeySpki: string): Promise<string> {
  const recipient = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(publicKeySpki),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );

  return bytesToBase64(
    new Uint8Array(await crypto.subtle.wrapKey("raw", key, recipient, { name: "RSA-OAEP" })),
  );
}

const AES_PARAMS = { name: "AES-GCM", length: 256 } as const;
const AES_USAGES: KeyUsage[] = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];

async function unwrapUnderParent(wrapped: string, parent: CryptoKey): Promise<CryptoKey | null> {
  try {
    const payload = base64ToBytes(wrapped);

    return await crypto.subtle.unwrapKey(
      "raw",
      payload.subarray(IV_BYTES),
      parent,
      { name: "AES-GCM", iv: payload.subarray(0, IV_BYTES) },
      AES_PARAMS,
      true,
      AES_USAGES,
    );
  } catch {
    return null;
  }
}

async function unwrapFromGrant(wrapped: string, privateKey: CryptoKey): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      base64ToBytes(wrapped),
      privateKey,
      { name: "RSA-OAEP" },
      AES_PARAMS,
      true,
      AES_USAGES,
    );
  } catch {
    return null;
  }
}

/**
 * Every key this device can derive from what the server handed over.
 *
 * What is *not* here is as important as what is: a key with no route from a grant cannot
 * be produced, however many wraps mention it. That is the whole of access control in this
 * design — the server refusing to serve bytes is a convenience, and this is the guarantee.
 */
export async function openKeyGraph(graph: KeyGraph, privateKey: CryptoKey): Promise<Keyring> {
  const keyring: Keyring = new Map();

  for (const grant of graph.grants) {
    const key = await unwrapFromGrant(grant.wrapped, privateKey);

    if (key) {
      keyring.set(grant.keyId, key);
    }
  }

  return extendKeyring(graph, keyring);
}

/**
 * The same walk, from keys this device already holds rather than from grants.
 *
 * That is what an offline unlock needs: the wing key comes out of the account record, not
 * out of a grant, and everything under it has to be derivable from the cached graph without
 * the server having said anything. Mutates and returns the keyring it was given.
 */
export async function extendKeyring(graph: KeyGraph, keyring: Keyring): Promise<Keyring> {
  const byParent = new Map<string, KeyGraph["wraps"]>();

  for (const wrap of graph.wraps) {
    byParent.set(wrap.parentKeyId, [...(byParent.get(wrap.parentKeyId) ?? []), wrap]);
  }

  // The queue carries the keys themselves, not their ids, so the walk never has to ask
  // whether it can still open something it only just unwrapped.
  const queue: [string, CryptoKey][] = [...keyring];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [parentId, parent] = queue[cursor];

    for (const wrap of byParent.get(parentId) ?? []) {
      if (keyring.has(wrap.childKeyId)) {
        continue;
      }

      const child = await unwrapUnderParent(wrap.wrapped, parent);

      if (child) {
        keyring.set(wrap.childKeyId, child);
        queue.push([wrap.childKeyId, child]);
      }
    }
  }

  return keyring;
}

/** The cipher for one object, or null when this device cannot derive its key. */
export function cipherForKey(keyring: Keyring, keyId: string): Cipher | null {
  const key = keyring.get(keyId);

  return key ? createAesGcmCipher(key, keyId) : null;
}

/**
 * One graph holding everything in both, by identity.
 *
 * The cached copy and the server's answer each know something the other does not: a key
 * minted here has not been uploaded yet, and a key somebody shared was never ours to record.
 * Taking either alone loses one of them.
 */
export function mergeKeyGraphs(mine: KeyGraph | null, theirs: KeyGraph): KeyGraph {
  if (!mine) {
    return theirs;
  }

  const keys = new Map(mine.keys.map((key) => [key.id, key]));
  const wraps = new Map(mine.wraps.map((wrap) => [`${wrap.parentKeyId}>${wrap.childKeyId}`, wrap]));
  const grants = new Map(mine.grants.map((grant) => [grant.keyId, grant]));

  for (const key of theirs.keys) {
    keys.set(key.id, key);
  }

  for (const wrap of theirs.wraps) {
    wraps.set(`${wrap.parentKeyId}>${wrap.childKeyId}`, wrap);
  }

  for (const grant of theirs.grants) {
    grants.set(grant.keyId, grant);
  }

  return { keys: [...keys.values()], wraps: [...wraps.values()], grants: [...grants.values()] };
}
