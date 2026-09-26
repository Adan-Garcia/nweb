import type { KeyGraph, KeyKind } from "@shared/sharing-contract";

import { type Cipher, getActiveCipher, registerCipher } from "../cipher";
import { createAesGcmCipher } from "../cipher";
import { createObjectKey, type Keyring, wrapUnderParent } from "./key-graph";

/**
 * Where a new object's key comes from.
 *
 * Every object that can be shared on its own — a course, a tag, a note, a task, a file —
 * gets a key of its own, wrapped under every container it sits in. That is what makes
 * "share this course" and "share this one note" different operations rather than the same
 * one at different depths.
 *
 * **Without an account there are no object keys at all.** A local workspace has one key, or
 * none, and nothing to hang a graph on; every function here falls back to the active cipher
 * and the app behaves exactly as it did before. Sharing needs an account, so keys that exist
 * to make sharing possible need one too.
 *
 * The keyring and the graph are module-level for the same reason the session is: a storage
 * module is not a component, and threading them through every call would put key management
 * in the signature of every function that writes a row.
 */
let keyring: Keyring | null = null;
let graph: KeyGraph | null = null;
/**
 * The last graph the server handed over. Kept apart from `graph`, which is what this device
 * uploads: the grants somebody else made are not this device's to record, but they are what
 * says whether a shared key came with a pen or only with reading glasses.
 */
let served: KeyGraph | null = null;
let onChange: ((graph: KeyGraph) => void) | null = null;
/** Set the moment a key is minted, cleared once the server has been told about it. */
let pendingUpload = false;

/**
 * Puts this device's keys in hand. Called once the wing key is derived, with the cached
 * graph already walked, so every key below it is present before a single row is read.
 *
 * Not `useKeyring`: the name is reserved for React hooks, and this is a plain module.
 */
export function holdKeyring(
  next: Keyring,
  cached: KeyGraph,
  notify?: (graph: KeyGraph) => void,
): void {
  keyring = next;
  graph = cached;
  onChange = notify ?? null;
  // A device that signs in may hold keys the server has never seen, if it minted them
  // offline. Assuming there is nothing to send would strand them here.
  pendingUpload = true;

  for (const [keyId, key] of next) {
    registerCipher(createAesGcmCipher(key, keyId));
  }
}

/**
 * Adds keys somebody shared to the ring this device already holds.
 *
 * Not `holdKeyring`, which replaces it: these arrive after unlock, from a graph the server
 * hands over, and they are additions to what is already in hand. They stay out of the
 * uploaded graph because they are not this device's to record.
 *
 * Without this a shared key would reach `cipher.ts` for reading and never the object
 * keyring, so every *write* into a shared course would miss and fall back to this
 * workspace's own key — re-sealing somebody else's note under a key they do not have.
 */
export function adoptSharedKeys(shared: Keyring): number {
  if (!keyring) {
    return 0;
  }

  let added = 0;

  for (const [keyId, key] of shared) {
    if (!keyring.has(keyId)) {
      keyring.set(keyId, key);
      registerCipher(createAesGcmCipher(key, keyId));
      added += 1;
    }
  }

  return added;
}

/** Drops every object key. Called when the workspace locks or the account is forgotten. */
export function forgetKeyring(): void {
  keyring = null;
  graph = null;
  served = null;
  onChange = null;
  pendingUpload = false;
}

/** Whether the server has yet to be told about a key this device minted. */
export function keysNeedUpload(): boolean {
  return pendingUpload && Boolean(graph);
}

export function markKeysUploaded(): void {
  pendingUpload = false;
}

/** What this device would upload: everything it has minted or been given. */
export function currentKeyGraph(): KeyGraph | null {
  return graph;
}

/** Records what the server says this account can reach, and in which role. */
export function holdServedGraph(next: KeyGraph): void {
  served = next;
}

export function servedKeyGraph(): KeyGraph | null {
  return served;
}

/** The keys themselves, for the one caller that wraps them for somebody else. */
export function heldKeyring(): Keyring | null {
  return keyring;
}

/**
 * The cipher for writing a row that belongs to an object whose key already exists.
 *
 * Falls back to the active cipher, which covers both "no account" and "a row whose key this
 * device cannot derive" — the second cannot happen for something being written here, since
 * a device only writes what it can read.
 */
export function cipherForObject(objectKeyId: string | null | undefined): Cipher {
  const key = objectKeyId ? keyring?.get(objectKeyId) : undefined;

  return key ? createAesGcmCipher(key, objectKeyId ?? "") : getActiveCipher();
}

/**
 * Mints a key for something new and hangs it under every container it belongs to.
 *
 * A note carrying two tags is wrapped three times — under its course and under each tag —
 * because a nest is a tag and either route has to be enough to reach it. Each wrap is one
 * AES-GCM operation and about forty bytes, so a dense graph is cheap.
 *
 * Returns the active cipher unchanged when there is no account, which is what keeps a
 * purely local workspace exactly as it was.
 */
export async function provisionObjectKey(
  kind: KeyKind,
  parentKeyIds: (string | null | undefined)[],
): Promise<Cipher> {
  const parents = parentKeyIds
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, key: keyring?.get(id) }))
    .filter((parent): parent is { id: string; key: CryptoKey } => Boolean(parent.key));

  if (!keyring || !graph || !parents.length) {
    return getActiveCipher();
  }

  const object = await createObjectKey(kind);
  const wraps = await Promise.all(
    parents.map(async (parent) => ({
      parentKeyId: parent.id,
      childKeyId: object.keyId,
      wrapped: await wrapUnderParent(object.key, parent.key),
    })),
  );

  keyring.set(object.keyId, object.key);
  graph = {
    keys: [...graph.keys, { id: object.keyId, kind, rotatedFrom: null, createdAt: Date.now() }],
    wraps: [...graph.wraps, ...wraps],
    grants: graph.grants,
  };

  const cipher = createAesGcmCipher(object.key, object.keyId);

  registerCipher(cipher);
  pendingUpload = true;
  onChange?.(graph);

  return cipher;
}

/**
 * Takes a key that has just replaced another into the ring and the graph this device keeps.
 *
 * Without it the rows moved onto the new key would be unreadable here until the next sync
 * round fetched the graph back, and the next thing minted under the rotated object would
 * find no key to hang under.
 */
export function adoptRotatedKey(rotated: {
  keyId: string;
  key: CryptoKey;
  upload: Pick<KeyGraph, "keys" | "wraps" | "grants">;
}): void {
  if (!keyring || !graph) {
    return;
  }

  keyring.set(rotated.keyId, rotated.key);
  registerCipher(createAesGcmCipher(rotated.key, rotated.keyId));
  graph = {
    keys: [...graph.keys, ...rotated.upload.keys],
    wraps: [...graph.wraps, ...rotated.upload.wraps],
    grants: [...graph.grants, ...rotated.upload.grants],
  };
  onChange?.(graph);
}

/**
 * Hangs an existing key under one more container: what re-tagging a note has to do.
 *
 * Without it, adding a tag to a note would leave the note unreachable through that tag, and
 * sharing the tag would hand over an edge that leads nowhere.
 */
export async function wrapUnderAlso(
  objectKeyId: string | null | undefined,
  parentKeyId: string | null | undefined,
): Promise<void> {
  const child = objectKeyId ? keyring?.get(objectKeyId) : undefined;
  const parent = parentKeyId ? keyring?.get(parentKeyId) : undefined;

  if (!child || !parent || !graph || !objectKeyId || !parentKeyId) {
    return;
  }

  const exists = graph.wraps.some(
    (wrap) => wrap.parentKeyId === parentKeyId && wrap.childKeyId === objectKeyId,
  );

  if (exists) {
    return;
  }

  graph = {
    ...graph,
    wraps: [
      ...graph.wraps,
      {
        parentKeyId,
        childKeyId: objectKeyId,
        wrapped: await wrapUnderParent(child, parent),
      },
    ],
  };

  pendingUpload = true;
  onChange?.(graph);
}
