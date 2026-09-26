import type { Grant, KeyGraph, PutKeysRequest } from "@shared/sharing-contract";

import { type Cipher, createAesGcmCipher } from "../cipher";
import { createObjectKey, type Keyring, wrapForRecipient, wrapUnderParent } from "./key-graph";

/**
 * Rotating a key, which is the only thing that makes a revoke more than a promise.
 *
 * Dropping a grant stops the server handing those bytes over again. It does not unsee what
 * the other person already read, and it does not stop them opening a copy they kept. The
 * only answer to that is a new key for the object, and its content written back under it —
 * from then on, what they hold opens nothing new.
 *
 * What rotation cannot do is undo the past, and it is worth being plain about that: whatever
 * they had already read, they have. Rotation protects what comes next.
 */
export type RotationPlan = {
  /** The new key, ready to seal with. */
  cipher: Cipher;
  /** The same key unwrapped, so it can be sealed for the people who keep their access. */
  key: CryptoKey;
  previousKeyId: string;
  /** What the server has to be told, in the shape `POST /v1/keys` takes. */
  upload: PutKeysRequest;
};

/**
 * Builds the replacement for one key: a new key of the same kind, sitting on every edge the
 * old one sat on, with every child that hung off the old one re-wrapped under it.
 *
 * Returns null when this device cannot derive the key being rotated. That is the only
 * possible answer rather than a failure to report — the children have to be wrapped under
 * the new key, and a key that cannot be opened has no children anyone here can reach.
 */
export async function planKeyRotation({
  keyId,
  graph,
  keyring,
  publicKey,
}: {
  keyId: string;
  graph: KeyGraph;
  keyring: Keyring;
  /** This account's own public key, so the new key is wrapped for the person rotating it. */
  publicKey: string;
}): Promise<RotationPlan | null> {
  const record = graph.keys.find((key) => key.id === keyId);

  if (!record || !keyring.has(keyId)) {
    return null;
  }

  const replacement = await createObjectKey(record.kind);
  const wraps: PutKeysRequest["wraps"] = [];

  // Every container the old key hung under, the new one hangs under too, so whoever could
  // reach the object through a course or a tag still can.
  for (const wrap of graph.wraps.filter((edge) => edge.childKeyId === keyId)) {
    const parent = keyring.get(wrap.parentKeyId);

    if (parent) {
      wraps.push({
        parentKeyId: wrap.parentKeyId,
        childKeyId: replacement.keyId,
        wrapped: await wrapUnderParent(replacement.key, parent),
      });
    }
  }

  // Everything that hung under the old key hangs under the new one. The children keep their
  // own keys: rotating a course does not rewrite every note in it, only the envelope.
  for (const wrap of graph.wraps.filter((edge) => edge.parentKeyId === keyId)) {
    const child = keyring.get(wrap.childKeyId);

    if (child) {
      wraps.push({
        parentKeyId: replacement.keyId,
        childKeyId: wrap.childKeyId,
        wrapped: await wrapUnderParent(child, replacement.key),
      });
    }
  }

  const held = graph.grants.find((grant) => grant.keyId === keyId);

  return {
    cipher: createAesGcmCipher(replacement.key, replacement.keyId),
    key: replacement.key,
    previousKeyId: keyId,
    upload: {
      // `rotatedFrom` is what makes this a rotation rather than an unrelated key appearing:
      // a client holding rows under the old id can see where they are meant to move to.
      keys: [{ id: replacement.keyId, kind: record.kind, rotatedFrom: keyId }],
      wraps,
      grants: [
        {
          keyId: replacement.keyId,
          role: held?.role ?? "writer",
          wrapped: await wrapForRecipient(replacement.key, publicKey),
        },
      ],
    },
  };
}

export type Reshare = { keyId: string; email: string; role: Grant["role"]; wrapped: string };

/**
 * The wrap each remaining reader needs, so a rotation does not quietly revoke everybody.
 *
 * Revoking one person and rotating the key locks out every other person who held it, unless
 * each is handed the new one. Their public keys come from the server; the wrapping happens
 * here, which is why the server never holds a key it could open.
 */
export function reshareRotatedKey(
  plan: RotationPlan,
  recipients: { email: string; role: Grant["role"]; publicKey: string }[],
): Promise<Reshare[]> {
  return Promise.all(
    recipients.map(async (recipient) => ({
      keyId: plan.cipher.keyId,
      email: recipient.email,
      role: recipient.role,
      wrapped: await wrapForRecipient(plan.key, recipient.publicKey),
    })),
  );
}
