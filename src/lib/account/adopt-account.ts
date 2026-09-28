import type { KeyGraph } from "@shared/sharing-contract";

import {
  type Cipher,
  createAesGcmCipher,
  getActiveCipher,
  registerCipher,
  setActiveCipher,
} from "../crypto/cipher";
import { holdIdentity } from "../keys/identity";
import {
  createObjectKey,
  extendKeyring,
  type Keyring,
  openKeyGraph,
  wrapForRecipient,
} from "../keys/key-graph";
import { forgetKeyring, holdKeyring } from "../keys/object-keys";
import { rotateRowsToKey } from "../keys/rotate-rows";
import { readLockRecord, unlockWorkspace, writeLockHint } from "../lock/workspace-lock";
import { type AccountKeys, createAccountKeys, openAccountKeys } from "./account-keys";
import {
  type AccountRecord,
  forgetAccountRecord,
  readAccountRecord,
  updateAccountGraph,
  writeAccountRecord,
} from "./account-record";
import { unwrapWingKey, wrapWingKey } from "./wing-key";

/**
 * Taking a workspace that only ever existed on this device and putting it on an account.
 *
 * Before an account, the key is the passphrase: derive it, and every row opens. That cannot
 * stay true once a workspace can be shared, because a key derived from a passphrase cannot
 * be handed to anyone without handing over the passphrase. So adoption moves the workspace
 * onto a key of its own — the wing key — wrapped under the account key and therefore
 * reachable by the passphrase, by a second device, and by nobody else.
 *
 * The rows are rewritten once, here, and never again for the life of the account. A later
 * passphrase change re-wraps one small key and touches no note, which is the whole reason
 * the indirection is worth its complexity.
 */
export type AdoptionOutcome =
  | { ok: true; record: AccountRecord; moved: { documents: number; media: number; names: number } }
  | { ok: false; reason: "already-adopted" | "wrong-passphrase" | "enrolment-refused" };

export type AdoptAccountOptions = {
  email: string;
  baseUrl: string;
  /** The account passphrase. It becomes the only way into this workspace. */
  passphrase: string;
  /**
   * The workspace's current local passphrase, when it has one. A workspace with no lock
   * needs none: its rows are plaintext and the adoption is what seals them.
   */
  currentPassphrase?: string;
  /** Registers with the server and records the wing key. False means the server refused. */
  enrol: (request: {
    email: string;
    authKey: string;
    material: AccountRecord["material"];
    wingKeyId: string;
    grant: string;
  }) => Promise<boolean>;
};

/**
 * Does the whole move, in the order that survives being interrupted.
 *
 * The server is told first. A device that seals its rows under a key nothing else knows
 * about has made them unreadable everywhere but here, so the key is recorded before a
 * single row moves — and if the rewrite dies partway, the rows that did move are still
 * openable by an account that exists.
 */
export async function adoptAccount(options: AdoptAccountOptions): Promise<AdoptionOutcome> {
  if (await readAccountRecord()) {
    return { ok: false, reason: "already-adopted" };
  }

  // Whatever is sealing the workspace right now has to be in hand before anything is
  // rewritten, or the rewrite has nothing to read the old rows with.
  const from = await currentCipher(options.currentPassphrase);

  if (!from) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  const { keys, enrolment } = await createAccountKeys(options.passphrase);
  const wing = await createObjectKey("wing");
  const wrappedWingKey = await wrapWingKey(wing.key, keys.accountKey);

  const enrolled = await options.enrol({
    email: options.email,
    authKey: enrolment.authKey,
    material: enrolment.material,
    wingKeyId: wing.keyId,
    // The wing key sealed for this account's own identity, which is what makes it show up
    // in the key graph the server hands back on the next device.
    grant: await wrapForRecipient(wing.key, keys.publicKey),
  });

  if (!enrolled) {
    return { ok: false, reason: "enrolment-refused" };
  }

  const to = createAesGcmCipher(wing.key, wing.keyId);
  const moved = await rotateRowsToKey(from, to);

  registerCipher(from);
  setActiveCipher(to);

  // The lock hint stays true: there is still a passphrase between a cold load and the
  // notes, it is just the account's now rather than the workspace's own.
  writeLockHint(true);

  const record = await writeAccountRecord({
    email: options.email,
    baseUrl: options.baseUrl,
    material: enrolment.material,
    wingKeyId: wing.keyId,
    wrappedWingKey,
    graph: newWorkspaceGraph(wing.keyId),
  });

  // From here on, anything created gets a key of its own hung under the wing.
  await adoptKeyring(wing.keyId, wing.key, record.graph, keys.privateKey);

  return { ok: true, record, moved };
}

/**
 * The cipher the workspace is sealed with today: the plaintext one when it has no lock, and
 * the passphrase's when it has. A locked workspace with no passphrase offered, or a wrong
 * one, is null — there is nothing to read the rows with and nothing worth guessing.
 */
async function currentCipher(passphrase?: string): Promise<Cipher | null> {
  const lock = await readLockRecord();

  if (!lock) {
    return getActiveCipher();
  }

  if (passphrase !== undefined && (await unlockWorkspace(passphrase))) {
    return getActiveCipher();
  }

  return getActiveCipher().name === "aes-gcm" ? getActiveCipher() : null;
}

/**
 * The graph before anything has been shared: one key and no edges.
 *
 * No grant is recorded here even though one exists. A grant is a wrap, and the wrap lives on
 * the server; this cache holds the shape so an offline device knows what it is looking at,
 * and the wing key itself is already on disk beside it. Writing a grant down would mean
 * keeping a second copy of the same secret for no reason.
 */
function newWorkspaceGraph(wingKeyId: string): KeyGraph {
  return { keys: [{ id: wingKeyId, kind: "wing", rotatedFrom: null }], wraps: [], grants: [] };
}

export type SignInOutcome =
  | { ok: true; keys: AccountKeys; cipher: Cipher; wingKey: CryptoKey }
  | { ok: false; reason: "no-account" | "wrong-passphrase" };

/**
 * Opens the account this device already knows about, with no network at all.
 *
 * Everything needed is on disk and sealed: the passphrase unwraps the account key, the
 * account key unwraps the wing key, and the wing key opens the rows. A device that has
 * signed in once never needs the server to read its own notes again.
 */
export async function unlockAccount(passphrase: string): Promise<SignInOutcome> {
  const record = await readAccountRecord();

  if (!record) {
    return { ok: false, reason: "no-account" };
  }

  const keys = await openAccountKeys(passphrase, record.material);

  if (!keys) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  const wingKey = await unwrapWingKey(record.wrappedWingKey, keys.accountKey);

  if (!wingKey) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  const cipher = createAesGcmCipher(wingKey, record.wingKeyId);

  setActiveCipher(cipher);
  await adoptKeyring(record.wingKeyId, wingKey, record.graph, keys.privateKey);

  return { ok: true, keys, cipher, wingKey };
}

/**
 * Signs out without touching a note.
 *
 * The rows stay sealed under the wing key, which is only reachable through the account, so
 * nothing is destroyed and nothing is left readable. Signing back in opens it again.
 */
export async function forgetAccount(): Promise<void> {
  holdIdentity(null);
  forgetKeyring();
  await forgetAccountRecord();
}

/**
 * Walks the cached graph from the wing key and puts every key it yields in hand, then keeps
 * the record in step as more are minted.
 *
 * Done from the cache rather than from the server on purpose: a device that has signed in
 * once opens every note it holds with no network, including the ones under courses it made
 * on a plane.
 */
export async function adoptKeyring(
  wingKeyId: string,
  wingKey: CryptoKey,
  cached: KeyGraph,
  privateKey: CryptoKey,
) {
  holdIdentity(privateKey);

  // Two roots, because there are two ways a key reaches this device. The wing key comes off
  // disk and everything below it is reached by walking wraps. A key somebody *shared* hangs
  // under nothing of ours — the only route to it is a grant, sealed under this account's
  // public key — so the grants are walked too, and the results merged.
  const keyring: Keyring = new Map([[wingKeyId, wingKey]]);

  await extendKeyring(cached, keyring);

  for (const [keyId, key] of await openKeyGraph(cached, privateKey)) {
    if (!keyring.has(keyId)) {
      keyring.set(keyId, key);
    }
  }

  holdKeyring(keyring, cached, (next) => {
    void updateAccountGraph(next);
  });
}
