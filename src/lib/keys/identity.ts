/**
 * This account's private key, while the workspace is open.
 *
 * A module-level value rather than React state, for the reason the session is: the things
 * that need it are not all components. A background sync round has to open the grants the
 * server hands back, and it has no hook to read them from.
 *
 * In memory and nowhere else. The sealed copy on disk is the durable one, and it only opens
 * with the passphrase — keeping an unsealed key beside it would undo that.
 */
let privateKey: CryptoKey | null = null;

export function holdIdentity(key: CryptoKey | null): void {
  privateKey = key;
}

export function heldIdentity(): CryptoKey | null {
  return privateKey;
}
