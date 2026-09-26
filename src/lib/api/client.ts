import { type ApiError, apiErrorSchema } from "@shared/account-contract";
import type { z } from "zod";

/**
 * The one place this app talks to a server.
 *
 * Every response is parsed with the schema the contract declares, because a server is not
 * trusted any more than a file is: `CLAUDE.md` §5 says validate all external data at the
 * boundary, and "external" includes the thing we wrote. A body that does not match the
 * contract is a failure, not a value to pass inward and discover later.
 */
export type ApiSession = { baseUrl: string; token?: string };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError["error"] };

const NETWORK_ERROR: ApiResult<never> = { ok: false, error: "invalid_request" };

async function toError(response: Response): Promise<ApiError["error"]> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));

  if (parsed.success) {
    return parsed.data.error;
  }

  // A status with no body this app understands. The status is still worth reading.
  return response.status === 401 ? "unauthorized" : "invalid_request";
}

export async function apiRequest<Schema extends z.ZodType>(
  session: ApiSession,
  path: string,
  options: { method?: string; body?: unknown; schema: Schema },
): Promise<ApiResult<z.infer<Schema>>> {
  let response: Response;

  try {
    response = await fetch(`${session.baseUrl}${path}`, {
      method: options.method ?? "POST",
      headers: {
        "content-type": "application/json",
        ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // No network, or a server that is not there. Not a reason to lose what is local.
    return NETWORK_ERROR;
  }

  if (!response.ok) {
    return { ok: false, error: await toError(response) };
  }

  const parsed = options.schema.safeParse(await response.json().catch(() => null));

  return parsed.success ? { ok: true, value: parsed.data } : NETWORK_ERROR;
}

/** Media goes up and comes back as bytes, so it does not go through the JSON path. */
export async function apiSendBytes(
  session: ApiSession,
  path: string,
  bytes: Uint8Array,
  headers: Record<string, string>,
): Promise<ApiResult<null>> {
  try {
    const response = await fetch(`${session.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        ...headers,
        ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      },
      body: new Uint8Array(bytes),
    });

    return response.ok ? { ok: true, value: null } : { ok: false, error: await toError(response) };
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiFetchBytes(
  session: ApiSession,
  path: string,
): Promise<ApiResult<{ bytes: Uint8Array; headers: Headers }>> {
  try {
    const response = await fetch(`${session.baseUrl}${path}`, {
      headers: session.token ? { authorization: `Bearer ${session.token}` } : {},
    });

    if (!response.ok) {
      return { ok: false, error: await toError(response) };
    }

    return {
      ok: true,
      value: { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers },
    };
  } catch {
    return NETWORK_ERROR;
  }
}
