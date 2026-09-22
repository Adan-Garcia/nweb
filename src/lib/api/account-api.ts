import {
  type AccountKeyMaterial,
  preloginResponseSchema,
  type SessionResponse,
  sessionResponseSchema,
} from "@shared/account-contract";
import { type KeyGraph, keyGraphSchema, type PutKeysRequest } from "@shared/sharing-contract";
import { z } from "zod";

import { apiRequest, type ApiResult, type ApiSession } from "./client";

/**
 * The account endpoints, in the shapes the app uses them in.
 *
 * Each one is `apiRequest` plus the schema the contract declares, which is the whole point
 * of `shared/`: the thing that validates the response here is the thing that produced it
 * there, so a field cannot be added to one and forgotten in the other.
 */
const registeredSchema = z.object({ userId: z.uuid() });

/**
 * Where this build talks to. `VITE_` values are public — they are compiled into the bundle
 * and anyone can read them — which is right for a URL and would be wrong for anything else.
 * Absent means this build has no server, which is a supported way to run the app.
 */
export function apiBaseUrl(env: { VITE_API_URL?: string } = import.meta.env): string | null {
  const url = env.VITE_API_URL?.trim();

  return url ? url.replace(/\/$/, "") : null;
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
export function putKeys(session: ApiSession, request: PutKeysRequest): Promise<ApiResult<null>> {
  return apiRequest(session, "/v1/keys", { body: request, schema: z.null() });
}

export function fetchKeyGraph(session: ApiSession): Promise<ApiResult<KeyGraph>> {
  return apiRequest(session, "/v1/keys/graph", { method: "GET", schema: keyGraphSchema });
}
