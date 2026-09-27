import type { AccountKeyMaterial } from "@shared/account-contract";
import type { Grant, KeyRecord, KeyWrap } from "@shared/sharing-contract";
import type { MediaMeta, SyncRow } from "@shared/sync-contract";
import { http, HttpResponse } from "msw";

import { server } from "./server";

/**
 * A stateful stand-in for the sync server, for the client's account flows.
 *
 * The real server cannot be imported here (it needs Node types the app's config does not
 * have), so this keeps the same contract in memory: accounts proved by their auth key,
 * sessions, each account's own keys, wraps and grants, rows resolved by `updatedAt` and
 * handed out by `seq`, blobs, and deletion. What it leaves out is sharing across accounts,
 * which the account flows do not need and `server/src/*.test.ts` covers against Postgres.
 */
type Account = {
  id: string;
  email: string;
  authKey: string;
  material: AccountKeyMaterial;
  keys: KeyRecord[];
  wraps: KeyWrap[];
  grants: Grant[];
  rows: Map<string, { row: SyncRow; seq: number }>;
  media: Map<string, { meta: MediaMeta; bytes: Uint8Array }>;
};

const failure = (error: string, status: number) =>
  HttpResponse.json({ error, message: error }, { status });

export function startFakeSyncServer(baseUrl = "https://sync.example.test") {
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, string>();
  let seq = 0;
  let counter = 0;

  const caller = (request: Request): Account | null => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    const email = token ? sessions.get(token) : undefined;

    return email ? (accounts.get(email) ?? null) : null;
  };

  const body = async <T>(request: Request): Promise<T> => (await request.json()) as T;
  const at = (path: string) => `${baseUrl}${path}`;

  server.use(
    http.post(at("/v1/auth/prelogin"), async ({ request }) => {
      const { email } = await body<{ email: string }>(request);
      const decoy = {
        name: "Argon2id",
        memorySize: 1024,
        iterations: 1,
        parallelism: 1,
        salt: "ZGVjb3ktc2FsdC12YWx1ZQ",
      };

      return HttpResponse.json({ kdf: accounts.get(email)?.material.kdf ?? decoy });
    }),
    http.post(at("/v1/auth/register"), async ({ request }) => {
      const { email, authKey, ...material } = await body<
        { email: string; authKey: string } & AccountKeyMaterial
      >(request);

      if (accounts.has(email)) {
        return failure("email_taken", 409);
      }

      counter += 1;
      const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;

      accounts.set(email, {
        id,
        email,
        authKey,
        material,
        keys: [],
        wraps: [],
        grants: [],
        rows: new Map(),
        media: new Map(),
      });

      return HttpResponse.json({ userId: id }, { status: 201 });
    }),
    http.post(at("/v1/auth/session"), async ({ request }) => {
      const { email, authKey } = await body<{ email: string; authKey: string }>(request);
      const account = accounts.get(email);

      if (!account || account.authKey !== authKey) {
        return failure("invalid_credentials", 401);
      }

      counter += 1;
      const token = `token-${counter}`;

      sessions.set(token, email);

      return HttpResponse.json({
        userId: account.id,
        email,
        token,
        expiresAt: Date.now() + 86_400_000,
        keyMaterial: account.material,
      });
    }),
    http.delete(at("/v1/auth/session"), ({ request }) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";

      sessions.delete(token);

      return new HttpResponse(null, { status: 204 });
    }),
    http.post(at("/v1/auth/passphrase"), async ({ request }) => {
      const account = caller(request);
      const change = await body<{
        currentAuthKey: string;
        nextAuthKey: string;
        kdf: AccountKeyMaterial["kdf"];
        sealedAccountKey: string;
      }>(request);

      if (!account) {
        return failure("unauthorized", 401);
      }

      if (account.authKey !== change.currentAuthKey) {
        return failure("invalid_credentials", 401);
      }

      account.authKey = change.nextAuthKey;
      account.material = {
        ...account.material,
        kdf: change.kdf,
        sealedAccountKey: change.sealedAccountKey,
      };

      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(at("/v1/auth/account"), async ({ request }) => {
      const account = caller(request);
      const { authKey } = await body<{ authKey: string }>(request);

      if (!account) {
        return failure("unauthorized", 401);
      }

      if (account.authKey !== authKey) {
        return failure("invalid_credentials", 401);
      }

      accounts.delete(account.email);

      for (const [token, email] of sessions) {
        if (email === account.email) {
          sessions.delete(token);
        }
      }

      return new HttpResponse(null, { status: 204 });
    }),
    http.post(at("/v1/keys"), async ({ request }) => {
      const account = caller(request);
      const sent = await body<{ keys: KeyRecord[]; wraps: KeyWrap[]; grants: Grant[] }>(request);

      if (!account) {
        return failure("unauthorized", 401);
      }

      for (const key of sent.keys) {
        if (!account.keys.some((known) => known.id === key.id)) {
          account.keys.push({ ...key, createdAt: Date.now() });
        }
      }

      account.wraps.push(...sent.wraps);
      account.grants.push(...sent.grants);

      return new HttpResponse(null, { status: 204 });
    }),
    http.get(at("/v1/keys/graph"), ({ request }) => {
      const account = caller(request);

      return account
        ? HttpResponse.json({ keys: account.keys, wraps: account.wraps, grants: account.grants })
        : failure("unauthorized", 401);
    }),
    http.post(at("/v1/sync"), async ({ request }) => {
      const account = caller(request);
      const { since, rows } = await body<{ since: number; rows: SyncRow[] }>(request);

      if (!account) {
        return failure("unauthorized", 401);
      }

      for (const row of rows) {
        const key = `${row.store}|${row.id}`;
        const stored = account.rows.get(key);

        if (!stored || stored.row.updatedAt < row.updatedAt) {
          seq += 1;
          account.rows.set(key, { row, seq });
        }
      }

      const newer = [...account.rows.values()].filter((entry) => entry.seq > since);

      return HttpResponse.json({
        seq,
        rows: newer.sort((a, b) => a.seq - b.seq).map((entry) => entry.row),
        hasMore: false,
      });
    }),
    http.post(at("/v1/sync/backfill"), () =>
      HttpResponse.json({ seq: 0, rows: [], hasMore: false }),
    ),
    http.get(at("/v1/media"), ({ request }) => {
      const account = caller(request);

      return account
        ? HttpResponse.json({ media: [...account.media.values()].map((entry) => entry.meta) })
        : failure("unauthorized", 401);
    }),
    http.put(at("/v1/media/:id"), async ({ request, params }) => {
      const account = caller(request);

      if (!account) {
        return failure("unauthorized", 401);
      }

      const id = String(params.id);
      const headers = request.headers;

      account.media.set(id, {
        meta: {
          id,
          mimeType: headers.get("x-media-type") ?? "",
          created: Number(headers.get("x-media-created") ?? 0),
          updatedAt: Number(headers.get("x-media-updated") ?? 0),
          keyId: headers.get("x-media-key") ?? "",
          encryption: headers.get("x-media-encryption") === "aes-gcm" ? "aes-gcm" : "none",
        },
        bytes: new Uint8Array(await request.arrayBuffer()),
      });

      return new HttpResponse(null, { status: 204 });
    }),
    http.get(at("/v1/media/:id"), ({ request, params }) => {
      const stored = caller(request)?.media.get(String(params.id));

      if (!stored) {
        return failure("invalid_request", 404);
      }

      return new HttpResponse(stored.bytes.slice().buffer, {
        headers: {
          "x-media-type": stored.meta.mimeType,
          "x-media-created": String(stored.meta.created),
          "x-media-updated": String(stored.meta.updatedAt),
          "x-media-key": stored.meta.keyId,
          "x-media-encryption": stored.meta.encryption,
        },
      });
    }),
  );

  return {
    baseUrl,
    /** The account under this address, as the server holds it, or undefined once deleted. */
    account: (email: string) => accounts.get(email),
    /** How many rows of one store the account holds, not counting tombstones. */
    rowCount: (email: string, store: SyncRow["store"]) =>
      [...(accounts.get(email)?.rows.values() ?? [])].filter(
        (entry) => entry.row.store === store && entry.row.deletedAt === null,
      ).length,
    openSessions: () => sessions.size,
  };
}
