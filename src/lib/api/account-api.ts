import {
  type AccountKeyMaterial,
  type ChangePassphraseRequest,
  preloginResponseSchema,
  type SessionResponse,
  sessionResponseSchema,
} from "@shared/account-contract";
import {
  type KeyGraph,
  keyGraphSchema,
  type PublicKeyResponse,
  publicKeyResponseSchema,
  type PutKeysRequest,
  shareListSchema,
  type ShareRole,
} from "@shared/sharing-contract";
import { type PushKey, pushKeySchema } from "@shared/sync-contract";
import { z } from "zod";

import { apiRequest, type ApiResult, type ApiSession } from "./client";
import { readServerUrl } from "./server-url";

/**
 * The account endpoints, in the shapes the app uses them in.
 *
 * Each one is `apiRequest` plus the schema the contract declares, which is the whole point
 * of `shared/`: the thing that validates the response here is the thing that produced it
 * there, so a field cannot be added to one and forgotten in the other.
 */
const registeredSchema = z.object({ userId: z.uuid() });

/**
 * Where this device talks to: the server chosen in Settings, or the one the build names
 * (`VITE_API_URL`), or none. See `server-url.ts`. Null is a supported way to run the app.
 */
export function apiBaseUrl(env: { VITE_API_URL?: string } = import.meta.env): string | null {
  return readServerUrl(env);
}

export function registerAccount(
  session: ApiSession,
  request: { email: string; authKey: string; material: AccountKeyMaterial },
): Promise<ApiResult<{ userId: string }>> {
  return apiRequest(session, "/v1/auth/register", {
    body: {
      email: request.email,
      authKey: request.authKey,
      kdf: request.material.kdf,
      sealedAccountKey: request.material.sealedAccountKey,
      publicKey: request.material.publicKey,
      sealedPrivateKey: request.material.sealedPrivateKey,
    },
    schema: registeredSchema,
  });
}

/** The parameters to derive with, for an address this device has never seen before. */
export function prelogin(session: ApiSession, email: string) {
  return apiRequest(session, "/v1/auth/prelogin", {
    body: { email },
    schema: preloginResponseSchema,
  });
}

export function openSession(
  session: ApiSession,
  email: string,
  authKey: string,
): Promise<ApiResult<SessionResponse>> {
  return apiRequest(session, "/v1/auth/session", {
    body: { email, authKey },
    schema: sessionResponseSchema,
  });
}

export function endSession(session: ApiSession): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/auth/session", {
    method: "DELETE",
    schema: z.null(),
  });
}

/** Records keys, wraps and grants made on this device. The server stores bytes it cannot read. */
/** A new passphrase over the same account: one re-wrapped key and a new proof. */
export function changeAccountPassphrase(
  session: ApiSession,
  request: ChangePassphraseRequest,
): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/auth/passphrase", { body: request, schema: z.null() });
}

/** Erases the account on the server, after the passphrase is proved once more. */
export function deleteServerAccount(session: ApiSession, authKey: string) {
  return apiRequest(session, "/v1/auth/account", {
    method: "DELETE",
    body: { authKey },
    schema: z.null(),
  });
}

export function putKeys(session: ApiSession, request: PutKeysRequest): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/keys", { body: request, schema: z.null() });
}

export function fetchKeyGraph(session: ApiSession): Promise<ApiResult<KeyGraph>> {
  return apiRequest(session, "/v1/keys/graph", { method: "GET", schema: keyGraphSchema });
}

/** Hands a key to somebody else. The wrap was made here; the server stores bytes. */
export function shareKey(
  session: ApiSession,
  request: { keyId: string; email: string; role: ShareRole; wrapped: string },
): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/keys/share", { body: request, schema: z.null() });
}

/** Takes it back. What it cannot do is unsee what they already read — that needs rotation. */
export function revokeKey(
  session: ApiSession,
  request: { keyId: string; email: string },
): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/keys/revoke", { body: request, schema: z.null() });
}

export function listShares(session: ApiSession, keyId: string) {
  return apiRequest(session, `/v1/keys/${encodeURIComponent(keyId)}/shares`, {
    method: "GET",
    schema: shareListSchema,
  });
}

/** What you need before you can share with someone: the key you seal it for them with. */
export function lookupPublicKey(
  session: ApiSession,
  email: string,
): Promise<ApiResult<PublicKeyResponse>> {
  return apiRequest(session, `/v1/users/public-key?email=${encodeURIComponent(email)}`, {
    method: "GET",
    schema: publicKeyResponseSchema,
  });
}

/**
 * The server's VAPID public key, or null when this deployment sends no reminders. Needs no
 * session: it is the same key for everybody and is meaningless without its private half.
 */
export function fetchPushKey(session: ApiSession): Promise<ApiResult<PushKey>> {
  return apiRequest(session, "/v1/push/key", { method: "GET", schema: pushKeySchema });
}
