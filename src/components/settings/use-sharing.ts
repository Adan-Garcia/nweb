import { useCallback, useEffect, useState } from "react";
import type { ShareRole } from "@shared/sharing-contract";

import { listShares, lookupPublicKey, revokeKey, shareKey } from "@/lib/api/account-api";
import type { ApiSession } from "@/lib/api/client";
import { writeSharePath } from "@/lib/hierarchy/share-path-storage";
import { wrapForRecipient } from "@/lib/keys/key-graph";
import { heldKeyring } from "@/lib/keys/object-keys";
import { rotateSharedKey } from "@/lib/keys/rotate-shared";
import { listShareable, type Shareable } from "@/lib/keys/shareable";
import { notifySuccess } from "@/lib/toast";

/**
 * Sharing, as a screen sees it.
 *
 * Two things happen here that look like one. Handing a key over is a wrap made on this
 * device against a public key the server published — the server never holds anything it
 * could open. Taking it back is a revoke *and* a rotation: dropping the grant stops the
 * server serving those bytes, and only a new key stops what they already copied from
 * opening. Both, or the "remove" button is a promise the maths does not make.
 */
export type ShareEntry = { email: string; role: ShareRole };

export function useSharing(sessionFor: () => ApiSession | null, publicKey: string | null) {
  const [shareable, setShareable] = useState<Shareable[]>([]);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const refresh = useCallback(async () => {
    setShareable(await listShareable());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Who currently holds the selected key. Addresses only; never the wraps themselves. */
  const loadShares = useCallback(
    async (keyId: string | null) => {
      setSelected(keyId);
      setShares([]);

      const session = sessionFor();

      if (!keyId || !session?.token) {
        return;
      }

      const listed = await listShares(session, keyId);

      setShares(listed.ok ? listed.value.shares : []);

      // Something shared before paths existed gets one the first time its owner looks at it.
      if (listed.ok && listed.value.shares.length) {
        await writeSharePath(keyId);
      }
    },
    [sessionFor],
  );

  const share = useCallback(
    async (keyId: string, email: string, role: ShareRole) => {
      const session = sessionFor();
      const keyring = heldKeyring();
      const key = keyring?.get(keyId);

      if (!session?.token || !key) {
        setError("Not connected to the server, so nothing can be shared.");
        return false;
      }

      setIsWorking(true);
      setError(null);

      try {
        // Their public key first: the wrap is made here, against what they published, so
        // the server is handed bytes rather than a key.
        const recipient = await lookupPublicKey(session, email);

        if (!recipient.ok) {
          setError("Nobody with that address can be shared with.");
          return false;
        }

        const sent = await shareKey(session, {
          keyId,
          email,
          role,
          wrapped: await wrapForRecipient(key, recipient.value.publicKey),
        });

        if (!sent.ok) {
          setError("The server would not record that. Nothing was shared.");
          return false;
        }

        // The names above it, so it arrives somewhere rather than nowhere. Sealed under its
        // own key: the recipient reads the path and not a sibling on it.
        await writeSharePath(keyId);

        await loadShares(keyId);
        notifySuccess(`Shared with ${email}`);
        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [loadShares, sessionFor],
  );

  /**
   * Removes someone, and rotates the key so that what they kept stops opening anything new.
   *
   * Everyone else who held it is handed the new key in the same pass. Without that, removing
   * one person would quietly remove all of them.
   */
  const revoke = useCallback(
    async (keyId: string, email: string) => {
      const session = sessionFor();

      if (!session?.token || !heldKeyring() || !publicKey) {
        setError("Not connected to the server, so nothing can be taken back.");
        return false;
      }

      setIsWorking(true);
      setError(null);

      try {
        const dropped = await revokeKey(session, { keyId, email });

        if (!dropped.ok) {
          setError("The server would not drop that. Nothing was changed.");
          return false;
        }

        const remaining = shares.filter((entry) => entry.email !== email);

        await rotateSharedKey({ session, keyId, publicKey, recipients: remaining });
        await loadShares(keyId);
        notifySuccess(`Stopped sharing with ${email}`);

        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [loadShares, publicKey, sessionFor, shares],
  );

  return {
    shareable,
    shares,
    selected,
    error,
    isWorking,
    select: (keyId: string | null) => void loadShares(keyId),
    share,
    revoke,
    refresh,
  };
}
