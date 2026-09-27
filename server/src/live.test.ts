// @vitest-environment node
import { serve, upgradeWebSocket } from "@hono/node-server";
import { LIVE_CLOSE_UNAUTHORIZED } from "@shared/live-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createLiveHub, type LiveHub } from "./live";
import { LIVE_AUTH_DEADLINE_MS, liveSession } from "./live-routes";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

const BASE = {
  authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
  kdf: {
    name: "Argon2id" as const,
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    salt: "c2FsdHktc2FsdC1oZXJlIQ==",
  },
  sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
  sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
};

let database: Sql & { close: () => Promise<void> };
let hub: LiveHub;
let app: ReturnType<typeof createApp>;

async function signUp(email: string) {
  await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...BASE, email, publicKey: `public-key-of-${email}` }),
  });

  const response = await app.request("/v1/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, authKey: BASE.authKey }),
  });
  return { token: ((await response.json()) as { token: string }).token };
}

const post = (token: string, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

/** A course under the owner's wing, so there is a key a share can reach somebody through. */
async function seedCourse(owner: string) {
  await post(owner, "/v1/keys", {
    keys: [
      { id: "wing-key", kind: "wing", rotatedFrom: null },
      { id: "branch-key", kind: "branch", rotatedFrom: null },
    ],
    wraps: [{ parentKeyId: "wing-key", childKeyId: "branch-key", wrapped: "w" }],
    grants: [{ keyId: "wing-key", role: "writer", wrapped: "g" }],
  });
}

const row = (id: string, keyId: string) => ({
  store: "branches",
  id,
  updatedAt: Date.now(),
  deletedAt: null,
  keyId,
  encryption: "aes-gcm",
  payload: "sealed",
  schedule: null,
});

/** A socket as the hub sees it, recording what it was sent. */
function recorder() {
  const sent: string[] = [];

  return { sent, socket: { send: (data: string) => void sent.push(data) } };
}

beforeEach(async () => {
  database = await createTestDb();
  hub = createLiveHub();
  app = createApp({
    sql: database,
    serverSecret: "a secret",
    allowedOrigins: [],
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    live: hub,
  });
});

afterEach(async () => {
  await database.close();
});

describe("the live hub", () => {
  it("nudges the writer's other devices, and whoever can read the key, and nobody else", async () => {
    const owner = await signUp("owner@example.com");
    const friend = await signUp("friend@example.com");
    const stranger = await signUp("stranger@example.com");
    await seedCourse(owner.token);
    await post(owner.token, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "for-friend",
    });

    const [ownerTab, friendTab, strangerTab] = [recorder(), recorder(), recorder()];
    for (const [index, tab] of [ownerTab, friendTab, strangerTab].entries()) {
      const session = liveSession({ sql: database, hub });

      await session.onMessage(
        JSON.stringify({ type: "auth", token: [owner, friend, stranger][index].token }),
        {
          send: tab.socket.send,
          close: vi.fn(),
        },
      );
    }

    expect(hub.size()).toBe(3);

    await post(owner.token, "/v1/sync", { since: 0, rows: [row("branch-1", "branch-key")] });

    const changed = (tab: { sent: string[] }) =>
      tab.sent.filter((data) => data.includes("changed"));

    expect(changed(ownerTab)).toHaveLength(1);
    expect(changed(friendTab)).toHaveLength(1);
    expect(changed(strangerTab)).toHaveLength(0);
  });

  it("nudges a recipient the moment something is shared with them", async () => {
    const owner = await signUp("owner@example.com");
    const friend = await signUp("friend@example.com");
    await seedCourse(owner.token);
    const tab = recorder();

    await liveSession({ sql: database, hub }).onMessage(
      JSON.stringify({ type: "auth", token: friend.token }),
      { send: tab.socket.send, close: vi.fn() },
    );

    await post(owner.token, "/v1/keys/share", {
      keyId: "branch-key",
      email: "friend@example.com",
      role: "reader",
      wrapped: "for-friend",
    });

    expect(tab.sent).toContain(JSON.stringify({ type: "changed" }));
  });

  it("says nothing when a sync sends no rows, and forgets a socket that leaves", async () => {
    const owner = await signUp("owner@example.com");
    const tab = recorder();
    const leave = hub.join("someone", tab.socket);

    await post(owner.token, "/v1/sync", { since: 0, rows: [] });
    expect(tab.sent).toEqual([]);

    const second = hub.join("someone", recorder().socket);

    leave();
    expect(hub.size()).toBe(1);
    second();
    expect(hub.size()).toBe(0);
    expect(await hub.nudge(database, { keyIds: [], userIds: ["someone"] })).toBe(0);
  });

  it("keeps nudging the others when one socket has already gone", async () => {
    const good = recorder();

    hub.join("u", {
      send: () => {
        throw new Error("gone");
      },
    });
    hub.join("u", good.socket);

    expect(await hub.nudge(database, { keyIds: [], userIds: ["u"] })).toBe(1);
    expect(good.sent).toHaveLength(1);
  });
});

describe("a live session", () => {
  it("closes on a bad token and registers nothing", async () => {
    const close = vi.fn();

    await liveSession({ sql: database, hub }).onMessage(
      JSON.stringify({ type: "auth", token: "not-a-session" }),
      { send: vi.fn(), close },
    );

    expect(close).toHaveBeenCalledWith(LIVE_CLOSE_UNAUTHORIZED);
    expect(hub.size()).toBe(0);
  });

  it("closes a socket that never says who it is, so an idle one cannot be held open", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const session = liveSession({ sql: database, hub });

    session.onOpen({ send: vi.fn(), close });
    vi.advanceTimersByTime(LIVE_AUTH_DEADLINE_MS);

    expect(close).toHaveBeenCalledWith(LIVE_CLOSE_UNAUTHORIZED);
    vi.useRealTimers();
  });

  it("leaves a socket open once it has said who it is, or once it has gone", async () => {
    const owner = await signUp("owner@example.com");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const joined = { send: vi.fn(), close: vi.fn() };
    const gone = { send: vi.fn(), close: vi.fn() };
    const session = liveSession({ sql: database, hub });
    const leaving = liveSession({ sql: database, hub });

    session.onOpen(joined);
    await session.onMessage(JSON.stringify({ type: "auth", token: owner.token }), joined);
    leaving.onOpen(gone);
    leaving.onClose();
    vi.advanceTimersByTime(LIVE_AUTH_DEADLINE_MS);

    expect(joined.close).not.toHaveBeenCalled();
    expect(gone.close).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores what is not an auth message, and anything after it has joined", async () => {
    const owner = await signUp("owner@example.com");
    const session = liveSession({ sql: database, hub });
    const connection = { send: vi.fn(), close: vi.fn() };

    await session.onMessage("not json", connection);
    await session.onMessage(JSON.stringify({ type: "hello" }), connection);
    await session.onMessage(new Uint8Array([1]), connection);
    expect(hub.size()).toBe(0);

    await session.onMessage(JSON.stringify({ type: "auth", token: owner.token }), connection);
    await session.onMessage(JSON.stringify({ type: "auth", token: owner.token }), connection);

    expect(hub.size()).toBe(1);
    expect(connection.send).toHaveBeenCalledTimes(1);

    session.onClose();
    expect(hub.size()).toBe(0);
  });

  it("does not register a socket that closed while its token was being checked", async () => {
    const owner = await signUp("owner@example.com");
    const session = liveSession({ sql: database, hub });
    const joining = session.onMessage(JSON.stringify({ type: "auth", token: owner.token }), {
      send: vi.fn(),
      close: vi.fn(),
    });

    session.onClose();
    await joining;

    expect(hub.size()).toBe(0);
  });
});

describe("the live channel, over a real socket", () => {
  it("authenticates, then delivers a nudge when another device writes", async () => {
    const websockets = new WebSocketServer({ noServer: true });
    const liveApp = createApp({
      sql: database,
      serverSecret: "a secret",
      allowedOrigins: [],
      limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
      live: hub,
      upgrade: upgradeWebSocket,
    });
    const server = serve({ fetch: liveApp.fetch, port: 0, websocket: { server: websockets } });
    const address = server.address();
    const port = typeof address === "string" ? address : address?.port;
    const owner = await signUp("owner@example.com");

    try {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/live`);
      const messages: string[] = [];
      const arrived = (count: number) =>
        vi.waitFor(() => expect(messages.length).toBeGreaterThanOrEqual(count));

      socket.on("message", (data: Buffer) => messages.push(data.toString()));
      await new Promise((resolve) => socket.once("open", resolve));
      socket.send(JSON.stringify({ type: "auth", token: owner.token }));
      await arrived(1);

      await post(owner.token, "/v1/sync", { since: 0, rows: [row("b", "k")] });
      await arrived(2);

      expect(messages.map((data) => JSON.parse(data) as unknown)).toEqual([
        { type: "ready" },
        { type: "changed" },
      ]);

      socket.close();
      await vi.waitFor(() => expect(hub.size()).toBe(0));

      // A bad session is answered by closing, with the code that says not to retry soon.
      const refused = new WebSocket(`ws://127.0.0.1:${port}/v1/live`);
      const code = new Promise<number>((resolve) => refused.once("close", resolve));

      await new Promise((resolve) => refused.once("open", resolve));
      refused.send(JSON.stringify({ type: "auth", token: "not-a-session" }));

      expect(await code).toBe(LIVE_CLOSE_UNAUTHORIZED);
    } finally {
      websockets.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
