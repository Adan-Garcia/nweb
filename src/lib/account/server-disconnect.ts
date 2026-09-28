import {
  changeAccountPassphrase,
  deleteServerAccount,
  endSession,
  openSession,
} from "../api/account-api";
import type { ApiSession } from "../api/client";
import { getApiSession, setApiSession } from "../api/session-store";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { extendKeyring, type Keyring } from "../keys/key-graph";
import { heldKeyring } from "../keys/object-keys";
import { refreshKeyGraph } from "../keys/refresh-graph";
import { rotateRowsToKey } from "../keys/rotate-rows";
import { lockCipherFor, resetLockRecord } from "../lock/lock-record";
import { resetSyncState } from "../sync/sync-service";
import { deriveAuthKey, openAccountKeys, resealAccountKeys } from "./account-keys";
import { type AccountRecord, readAccountRecord, writeAccountRecord } from "./account-record";
import { forgetAccount } from "./adopt-account";
import { unwrapWingKey } from "./wing-key";
import { dropRowsUnderKeys } from "./workspace-data";

/**
 * Taking this device off a server account, and the account off the server.
 *
 * Disconnecting keeps every note: the rows this workspace owns move from the account's keys
 * back onto the device's own lock, so the local account opens them with no server at all.
 * What other people shared goes, because it was never this device's to keep.
 */
export type DisconnectFailure = "not-connected" | "wrong-passphrase" | "unreachable";

export type DisconnectOutcome = { ok: true } | { ok: false; reason: DisconnectFailure };

/** A session for the account: the one already open, or a new one from the passphrase. */
async function sessionFor(record: AccountRecord, passphrase: string): Promise<ApiSession | null> {
  const open = getApiSession();

  if (open?.token) {
    return open;
  }

  return sessionWithAuthKey(record, await deriveAuthKey(passphrase, record.material.kdf));
}

async function sessionWithAuthKey(
  record: AccountRecord,
  authKey: string,
): Promise<ApiSession | null> {
  const session = await openSession({ baseUrl: record.baseUrl }, record.email, authKey);

  return session.ok ? { baseUrl: record.baseUrl, token: session.value.token } : null;
}

/**
 * Opens a session once the device is unlocked, so sync and sharing can run. A failure is
 * not a failed unlock — the notes are already open — so it only says whether it worked.
 */
export async function openAccountSession(passphrase: string): Promise<boolean> {
  const record = await readAccountRecord();

  if (!record) {
    return false;
  }

  return adoptSession(await sessionFor(record, passphrase));
}

/**
 * `openAccountSession` from a sign-in proof already derived — the one "Keep me signed in"
 * remembered — so a reload reconnects sync without the passphrase.
 */
export async function openAccountSessionWithAuthKey(authKey: string): Promise<boolean> {
  const record = await readAccountRecord();

  if (!record) {
    return false;
  }

  const open = getApiSession();

  return adoptSession(open?.token ? open : await sessionWithAuthKey(record, authKey));
}

async function adoptSession(session: ApiSession | null): Promise<boolean> {
  if (!session) {
    return false;
  }

  // The graph first, so that once a session is visible everything it brought is written.
  await refreshKeyGraph(session);
  setApiSession(session);

  return true;
}

/** The keys this workspace owns: its wing, and everything wrapped beneath it. */
async function ownKeys(record: AccountRecord, wingKey: CryptoKey): Promise<Keyring> {
  const own: Keyring = new Map([[record.wingKeyId, wingKey]]);

  await extendKeyring(record.graph, own);

  return own;
}

/**
 * Moves every row this workspace owns onto the device's lock and forgets the account.
 * The server account is left as it was; signing back in later offers to merge.
 */
export async function disconnectServer(passphrase: string): Promise<DisconnectOutcome> {
  const record = await readAccountRecord();

  if (!record) {
    return { ok: false, reason: "not-connected" };
  }

  const keys = await openAccountKeys(passphrase, record.material);
  const wingKey = keys ? await unwrapWingKey(record.wrappedWingKey, keys.accountKey) : null;

  if (!wingKey) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  // The lock record should already answer to this passphrase. An older device may have none,
  // or one from before the account; either way, one that does is written now.
  const lock = (await lockCipherFor(passphrase)) ?? (await resetLockRecord(passphrase));
  const own = await ownKeys(record, wingKey);

  for (const [keyId, key] of own) {
    await rotateRowsToKey(createAesGcmCipher(key, keyId), lock);
  }

  const shared = new Set([...(heldKeyring()?.keys() ?? [])].filter((keyId) => !own.has(keyId)));

  await dropRowsUnderKeys(shared);

  const session = getApiSession();

  if (session?.token) {
    await endSession(session);
  }

  setApiSession(null);
  resetSyncState();
  await (await getNotesDb()).clear("sync-bases");
  await forgetAccount();

  resetActiveCipher();
  setActiveCipher(lock);

  return { ok: true };
}

/**
 * Erases the account on the server, then takes this device off it. The notes stay here.
 *
 * The server goes first: a disconnect that fails partway is safe to retry, and the device
 * still opens with the account's cached keys meanwhile. Deleting second would leave a
 * device already detached from an account it could no longer prove it owns.
 */
export async function deleteServerAccountAndDisconnect(
  passphrase: string,
): Promise<DisconnectOutcome> {
  const record = await readAccountRecord();

  if (!record) {
    return { ok: false, reason: "not-connected" };
  }

  if (!(await openAccountKeys(passphrase, record.material))) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  const session = await sessionFor(record, passphrase);

  if (!session) {
    return { ok: false, reason: "unreachable" };
  }

  const deleted = await deleteServerAccount(
    session,
    await deriveAuthKey(passphrase, record.material.kdf),
  );

  if (!deleted.ok) {
    return {
      ok: false,
      reason: deleted.error === "invalid_credentials" ? "wrong-passphrase" : "unreachable",
    };
  }

  // The session died with the account; there is nothing left to end.
  setApiSession(null);

  return disconnectServer(passphrase);
}

/**
 * A new passphrase for a device on a server account. One key is re-wrapped, the server is
 * told, and the lock record follows; not a single note is rewritten. Needs the server,
 * because the account's other devices must stop accepting the old passphrase too.
 */
export async function changeServerPassphrase(
  current: string,
  next: string,
): Promise<DisconnectOutcome> {
  const record = await readAccountRecord();

  if (!record) {
    return { ok: false, reason: "not-connected" };
  }

  const keys = await openAccountKeys(current, record.material);

  if (!keys) {
    return { ok: false, reason: "wrong-passphrase" };
  }

  const session = await sessionFor(record, current);

  if (!session) {
    return { ok: false, reason: "unreachable" };
  }

  const enrolment = await resealAccountKeys(keys, record.material, next);
  const changed = await changeAccountPassphrase(session, {
    currentAuthKey: await deriveAuthKey(current, record.material.kdf),
    nextAuthKey: enrolment.authKey,
    kdf: enrolment.material.kdf,
    sealedAccountKey: enrolment.material.sealedAccountKey,
  });

  if (!changed.ok) {
    return { ok: false, reason: "unreachable" };
  }

  await writeAccountRecord({
    email: record.email,
    baseUrl: record.baseUrl,
    material: enrolment.material,
    wingKeyId: record.wingKeyId,
    wrappedWingKey: record.wrappedWingKey,
    graph: record.graph,
  });
  await resetLockRecord(next);

  return { ok: true };
}
