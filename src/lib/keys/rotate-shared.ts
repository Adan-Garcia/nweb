import type { KeyGraph, ShareRole } from "@shared/sharing-contract";

import { readAccountRecord } from "../account/account-record";
import { listShares, lookupPublicKey, putKeys, shareKey } from "../api/account-api";
import type { ApiSession } from "../api/client";
import { getNotesDb } from "../notes-db";
import { cipherForKey, type Keyring } from "./key-graph";
import { adoptRotatedKey, currentKeyGraph, heldKeyring, servedKeyGraph } from "./object-keys";
import { planKeyRotation, reshareRotatedKey } from "./rotate-key";
import { rotateRowsToKey } from "./rotate-rows";

/**
 * Replacing a shared key: on a revoke, and on a schedule.
 *
 * A key shared and re-shared for years is the same key, and every copy of it anyone ever
 * made still opens the rows under it. Rotating gives the object a new key, moves its rows
 * onto it, and hands it to everyone still on the list — so an old copy opens only what was
 * written before, and nothing after.
 */
export const ROTATE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

export type Recipient = { email: string; role: ShareRole };

/**
 * Whether this device holds every container the key hangs under.
 *
 * Only then can the new key be hung everywhere the old one was. A writer who was given one
 * course holds the course key and not the term above it: rotating from there would leave
 * the owner's own route to the course pointing at the old key, and lock them out of it.
 */
function holdsEveryParent(graph: KeyGraph, keyring: Keyring, keyId: string): boolean {
  const parents = graph.wraps.filter((wrap) => wrap.childKeyId === keyId);

  return parents.length > 0 && parents.every((wrap) => keyring.has(wrap.parentKeyId));
}

/**
 * The order matters: the server is told about the new key before a single row moves onto
 * it, because a row sealed under a key nothing else knows about is a row no other device
 * can open. The moved rows are stamped as edits, so sync carries them to everyone under the
 * new key; recipients, handed the new key, fetch them by backfill.
 */
export async function rotateSharedKey({
  session,
  keyId,
  publicKey,
  recipients,
}: {
  session: ApiSession;
  keyId: string;
  /** This account's own public key, so the new key is granted to the one rotating it. */
  publicKey: string;
  recipients: Recipient[];
}): Promise<boolean> {
  const keyring = heldKeyring();
  const graph = currentKeyGraph();

  if (!keyring || !graph || !holdsEveryParent(graph, keyring, keyId)) {
    return false;
  }

  const plan = await planKeyRotation({ keyId, graph, keyring, publicKey });

  if (!plan) {
    return false;
  }

  const recorded = await putKeys(session, plan.upload);

  if (!recorded.ok) {
    return false;
  }

  const previous = cipherForKey(keyring, keyId);

  adoptRotatedKey({ keyId: plan.cipher.keyId, key: plan.key, upload: plan.upload });

  if (previous) {
    await rotateRowsToKey(previous, plan.cipher, Date.now());
  }

  const withKeys = await Promise.all(
    recipients.map(async (entry) => {
      const theirs = await lookupPublicKey(session, entry.email);

      return theirs.ok ? { ...entry, publicKey: theirs.value.publicKey } : null;
    }),
  );

  for (const reshare of await reshareRotatedKey(
    plan,
    withKeys.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  )) {
    await shareKey(session, reshare);
  }

  return true;
}

/** Keys already looked at this session, so an old unshared key costs one request, once. */
const checked = new Set<string>();

/** Test seam: the next sweep looks at every key again. */
export function resetRotationSweep(): void {
  checked.clear();
}

/**
 * Rotates every shared key this device can rotate that is older than `ROTATE_AFTER_MS`.
 *
 * "Shared" is known without asking the server about every key: a thing that has ever been
 * shared from here has a path record (`share-paths`), and that record is sealed under its
 * key. Age is the server's `createdAt`, so two devices agree on it; a key it has not
 * reported yet is left for a later round rather than guessed at.
 */
export async function rotateAgedKeys(session: ApiSession, now = Date.now()): Promise<number> {
  const account = await readAccountRecord();
  const keyring = heldKeyring();

  if (!account || !keyring) {
    return 0;
  }

  const createdAt = new Map(
    [currentKeyGraph(), servedKeyGraph()]
      .flatMap((graph) => graph?.keys ?? [])
      .filter((key) => key.createdAt !== undefined)
      .map((key) => [key.id, key.createdAt ?? 0] as const),
  );
  const database = await getNotesDb();
  let rotated = 0;

  for (const record of await database.getAll("share-paths")) {
    const keyId = record.keyId;
    const born = keyId ? createdAt.get(keyId) : undefined;

    if (!keyId || record.deletedAt || checked.has(keyId) || born === undefined) {
      continue;
    }

    if (now - born < ROTATE_AFTER_MS) {
      continue;
    }

    checked.add(keyId);

    const listed = await listShares(session, keyId);

    if (!listed.ok || !listed.value.shares.length) {
      continue;
    }

    const done = await rotateSharedKey({
      session,
      keyId,
      publicKey: account.material.publicKey,
      recipients: listed.value.shares,
    });

    rotated += Number(done);
  }

  return rotated;
}
