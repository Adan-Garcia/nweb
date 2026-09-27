import type { SessionResponse } from "@shared/account-contract";

import { fetchKeyGraph, openSession, prelogin, putKeys, registerAccount } from "../api/account-api";
import { setApiSession } from "../api/session-store";
import { createAesGcmCipher, getActiveCipher, setActiveCipher } from "../crypto/cipher";
import { UntrustedKdfError } from "../crypto/kdf";
import { openKeyGraph } from "../keys/key-graph";
import { rotateRowsToKey } from "../keys/rotate-rows";
import { lockCipherFor, resetLockRecord } from "../lock/lock-record";
import { readLockRecord, writeLockHint } from "../lock/workspace-lock";
import { resetSyncState, runSyncRound } from "../sync/sync-service";
import { deriveAuthKey, openAccountKeys } from "./account-keys";
import { readAccountRecord, writeAccountRecord } from "./account-record";
import { adoptAccount, adoptKeyring } from "./adopt-account";
import { wrapWingKey } from "./wing-key";
import { clearWorkspaceData } from "./workspace-data";

/**
 * Putting this device on a server account: a new one, or one that already exists.
 *
 * Either way the account's passphrase becomes the device's. A person with a local account
 * and a server account has one passphrase, not two they would end up reusing: creating an
 * account uses the local one, and signing in to an existing one moves the lock over to it.
 */
export type ConnectFailure =
  | "already-connected"
  | "locked"
  | "wrong-passphrase"
  | "wrong-credentials"
  | "email-taken"
  | "unreachable"
  | "no-workspace"
  /** It asked for key-derivation parameters too weak to send it a proof made with. */
  | "untrusted-server";

export type ConnectOutcome = { ok: true } | { ok: false; reason: ConnectFailure };

/**
 * Creates a server account for this device's workspace, with the device's own passphrase.
 * The rows move once onto a key of the workspace's own; see `adopt-account.ts`.
 */
export async function enrolServerAccount(options: {
  email: string;
  passphrase: string;
  baseUrl: string;
}): Promise<ConnectOutcome> {
  const { email, passphrase, baseUrl } = options;
  let refusal: ConnectFailure = "unreachable";

  // Checked against the lock itself: adoption would otherwise carry on with whatever key is
  // already in memory, and the account would end up on a passphrase the device is not.
  if ((await readLockRecord()) && !(await lockCipherFor(passphrase))) {
    return {
      ok: false,
      reason: (await readAccountRecord()) ? "already-connected" : "wrong-passphrase",
    };
  }

  const outcome = await adoptAccount({
    email,
    baseUrl,
    passphrase,
    currentPassphrase: passphrase,
    enrol: async (request) => {
      const registered = await registerAccount(
        { baseUrl },
        { email: request.email, authKey: request.authKey, material: request.material },
      );

      if (!registered.ok) {
        refusal = registered.error === "email_taken" ? "email-taken" : "unreachable";
        return false;
      }

      const session = await openSession({ baseUrl }, email, request.authKey);

      if (!session.ok) {
        return false;
      }

      setApiSession({ baseUrl, token: session.value.token });

      // The wing key is recorded before a row moves, so a rewrite that dies partway leaves
      // rows that are still openable by an account that exists.
      const recorded = await putKeys(
        { baseUrl, token: session.value.token },
        {
          keys: [{ id: request.wingKeyId, kind: "wing", rotatedFrom: null }],
          wraps: [],
          grants: [{ keyId: request.wingKeyId, role: "writer", wrapped: request.grant }],
        },
      );

      return recorded.ok;
    },
  });

  if (!outcome.ok) {
    return {
      ok: false,
      reason:
        outcome.reason === "already-adopted"
          ? "already-connected"
          : outcome.reason === "wrong-passphrase"
            ? "wrong-passphrase"
            : refusal,
    };
  }

  resetSyncState();

  return { ok: true };
}

/** What becomes of the notes already on this device when an existing account arrives. */
export type ArrivalMode = "merge" | "replace";

/** Proves the passphrase to the server and gets the session, with its sealed key material. */
async function signInSession(
  baseUrl: string,
  email: string,
  passphrase: string,
): Promise<SessionResponse | ConnectFailure> {
  const parameters = await prelogin({ baseUrl }, email);

  if (!parameters.ok) {
    return "unreachable";
  }

  let authKey: string;

  try {
    authKey = await deriveAuthKey(passphrase, parameters.value.kdf);
  } catch (error) {
    // Nothing was sent: the proof is never made from parameters like these.
    if (error instanceof UntrustedKdfError) {
      return "untrusted-server";
    }

    throw error;
  }

  const session = await openSession({ baseUrl }, email, authKey);

  if (!session.ok) {
    return session.error === "invalid_credentials" ? "wrong-credentials" : "unreachable";
  }

  return session.value;
}

/**
 * Signs this device in to an account that already exists, on this server.
 *
 * The notes already here either join the account — re-sealed under its workspace key and
 * sent up on the next sync — or give way to it, emptied before the account's copy is pulled.
 * Which is the caller's to ask; this does what it is told. The device must be unlocked (or
 * have no lock at all), because merging reads every row it moves.
 */
export async function signInToServer(options: {
  email: string;
  passphrase: string;
  baseUrl: string;
  mode: ArrivalMode;
}): Promise<ConnectOutcome> {
  const { email, passphrase, baseUrl, mode } = options;

  if (await readAccountRecord()) {
    return { ok: false, reason: "already-connected" };
  }

  const from = getActiveCipher();

  if ((await readLockRecord()) && from.name !== "aes-gcm") {
    return { ok: false, reason: "locked" };
  }

  const session = await signInSession(baseUrl, email, passphrase);

  if (typeof session === "string") {
    return { ok: false, reason: session };
  }

  const keys = await openAccountKeys(passphrase, session.keyMaterial);

  if (!keys) {
    return { ok: false, reason: "wrong-credentials" };
  }

  const served = await fetchKeyGraph({ baseUrl, token: session.token });

  if (!served.ok) {
    return { ok: false, reason: "unreachable" };
  }

  // The account's own workspace is the one wing it holds a grant to: a wing is never shared.
  const granted = await openKeyGraph(served.value, keys.privateKey);
  const wing = served.value.keys.find((key) => key.kind === "wing" && granted.has(key.id));
  const wingKey = wing ? granted.get(wing.id) : undefined;

  if (!wing || !wingKey) {
    return { ok: false, reason: "no-workspace" };
  }

  const to = createAesGcmCipher(wingKey, wing.id);

  // The account is recorded before anything here is erased or moved. If this write fails,
  // nothing has happened to the notes on this device; if what follows fails, the device
  // already knows the account that the moved rows are now under.
  const record = await writeAccountRecord({
    email,
    baseUrl,
    material: session.keyMaterial,
    wingKeyId: wing.id,
    wrappedWingKey: await wrapWingKey(wingKey, keys.accountKey),
    graph: served.value,
  });

  if (mode === "replace") {
    await clearWorkspaceData();
  } else {
    // Stamped, so the next round sends every moved row up under the account's key.
    await rotateRowsToKey(from, to, Date.now());
  }

  setActiveCipher(to);
  await adoptKeyring(wing.id, wingKey, record.graph, keys.privateKey);

  // From here the account's passphrase opens this device, and it is the only one that does.
  await resetLockRecord(passphrase);
  writeLockHint(true);

  setApiSession({ baseUrl, token: session.token });
  resetSyncState();
  await runSyncRound();

  return { ok: true };
}
