import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setApiSession } from "@/lib/api/session-store";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { holdIdentity } from "@/lib/keys/identity";
import { createObjectKey, type Keyring } from "@/lib/keys/key-graph";
import {
  forgetKeyring,
  holdKeyring,
  keysNeedUpload,
  markKeysUploaded,
} from "@/lib/keys/object-keys";
import { server } from "@/test/server";

import {
  resetSyncState,
  runSyncRound,
  startBackgroundSync,
  subscribeToSyncChanges,
} from "./sync-service";

const BASE = "https://cuervo.example.com";

const rest = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls on real timers, and says what it was waiting for. */
async function until(ready: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (ready()) {
      return;
    }

    await rest(5);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

function quietServer(onSync?: () => void) {
  server.use(
    http.post(`${BASE}/v1/sync`, () => {
      onSync?.();

      return HttpResponse.json({ seq: 0, rows: [], hasMore: false });
    }),
    http.get(`${BASE}/v1/media`, () => HttpResponse.json({ media: [] })),
  );
}

beforeEach(() => {
  resetSyncState();
  setApiSession({ baseUrl: BASE, token: "a-token" });
});

afterEach(() => {
  setApiSession(null);
  resetSyncState();
  forgetKeyring();
  resetActiveCipher();
});

/** A device holding a wing key, with a graph the server has not been told about. */
async function withKeysToUpload() {
  const wing = await createObjectKey("wing");
  const keyring: Keyring = new Map([[wing.keyId, wing.key]]);

  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(keyring, {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [],
  });

  return wing;
}

describe("runSyncRound", () => {
  it("does nothing without a session", async () => {
    setApiSession(null);

    expect(await runSyncRound()).toBeNull();
  });

  it("does nothing with a base URL but no token", async () => {
    setApiSession({ baseUrl: BASE });

    expect(await runSyncRound()).toBeNull();
  });

  it("reports what it moved, and when", async () => {
    quietServer();

    const report = await runSyncRound();

    expect(report).toMatchObject({ pushed: 0, applied: 0, media: 0 });
    expect(report?.at).toBeGreaterThan(0);
  });

  it("joins a round already in flight rather than starting a second", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const [first, second] = await Promise.all([runSyncRound(), runSyncRound()]);

    // Two callers both wanted "everything is up to date", and one round delivers that.
    // Two in flight would push the same rows twice and race on the cursor.
    expect(rounds).toBe(1);
    expect(first).toBe(second);
  });

  it("can run again once the first has finished", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    await runSyncRound();
    await runSyncRound();

    expect(rounds).toBe(2);
  });

  it("counts nothing for media when there is no session to fetch it with", async () => {
    server.use(
      http.post(`${BASE}/v1/sync`, () => HttpResponse.json({ seq: 0, rows: [], hasMore: false })),
      http.get(`${BASE}/v1/media`, () => HttpResponse.error()),
    );

    // A media list that will not load is not a failed sync: the rows already landed.
    expect(await runSyncRound()).toMatchObject({ media: 0 });
  });

  it("reports nothing when the server cannot be reached", async () => {
    server.use(http.post(`${BASE}/v1/sync`, () => HttpResponse.error()));

    expect(await runSyncRound()).toBeNull();
  });
});

describe("sending keys", () => {
  it("records the keys this device minted before the rows that need them", async () => {
    const wing = await withKeysToUpload();
    const order: string[] = [];

    server.use(
      http.post(`${BASE}/v1/keys`, async ({ request }) => {
        const body = (await request.json()) as { keys: { id: string }[]; grants: unknown[] };

        order.push("keys");
        expect(body.keys.map((key) => key.id)).toEqual([wing.keyId]);
        // Grants are the server's to hand out; a client re-asserting one would be claiming
        // access rather than recording a key.
        expect(body.grants).toEqual([]);

        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/v1/sync`, () => {
        order.push("rows");

        return HttpResponse.json({ seq: 0, rows: [], hasMore: false });
      }),
      http.get(`${BASE}/v1/media`, () => HttpResponse.json({ media: [] })),
    );

    await runSyncRound();

    // A row whose key the server has never heard of is a row no second device can open.
    expect(order).toEqual(["keys", "rows"]);
    expect(keysNeedUpload()).toBe(false);
  });

  it("sends nothing when the server already has everything", async () => {
    await withKeysToUpload();
    markKeysUploaded();
    let sent = 0;

    server.use(
      http.post(`${BASE}/v1/keys`, () => {
        sent += 1;

        return new HttpResponse(null, { status: 204 });
      }),
    );
    quietServer();

    await runSyncRound();

    expect(sent).toBe(0);
  });

  it("keeps them pending when the server would not take them", async () => {
    await withKeysToUpload();

    server.use(
      http.post(`${BASE}/v1/keys`, () =>
        HttpResponse.json({ error: "invalid_request", message: "no" }, { status: 400 }),
      ),
    );
    quietServer();

    await runSyncRound();

    // Nothing is lost: the next round tries again.
    expect(keysNeedUpload()).toBe(true);
  });
});

describe("startBackgroundSync", () => {
  it("does not sync before the first period has passed", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const sync = startBackgroundSync({ everyMs: 60_000 });

    await rest(40);
    sync.stop();

    expect(rounds).toBe(0);
  });

  it("keeps syncing round after round", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const sync = startBackgroundSync({ everyMs: 5 });

    await until(() => rounds > 2, "a third round");
    sync.stop();
  });

  it("syncs when the tab comes back to the front", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const sync = startBackgroundSync({ everyMs: 60_000 });

    document.dispatchEvent(new Event("visibilitychange"));

    // The moment a tab becomes visible is exactly when being up to date matters, so it is
    // the better trigger and the timer is only the fallback.
    await until(() => rounds === 1, "a round on becoming visible");
    sync.stop();
  });

  it("syncs when the network comes back", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const sync = startBackgroundSync({ everyMs: 60_000 });

    window.dispatchEvent(new Event("online"));

    await until(() => rounds === 1, "a round on coming back online");
    sync.stop();
  });

  it("does nothing at all while the tab is hidden", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    const sync = startBackgroundSync({ everyMs: 5 });

    // A background tab that keeps polling is a battery cost nobody asked for.
    await rest(60);
    sync.stop();

    expect(rounds).toBe(0);
  });

  it("reports each round to whoever is listening", async () => {
    quietServer();
    const onRound = vi.fn();
    const sync = startBackgroundSync({ everyMs: 5, onRound });

    await until(() => onRound.mock.calls.length > 0, "a first round");
    sync.stop();

    expect(onRound).toHaveBeenCalledWith(expect.objectContaining({ pushed: 0, applied: 0 }));
  });

  it("stops, and stops listening", async () => {
    let rounds = 0;

    quietServer(() => (rounds += 1));

    const sync = startBackgroundSync({ everyMs: 5 });

    await until(() => rounds > 0, "a first round");
    sync.stop();
    const roundsWhenStopped = rounds;

    // Neither the timer nor the listeners it registered are still live.
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await rest(40);

    expect(rounds).toBe(roundsWhenStopped);
  });
});

describe("what a round tells the app", () => {
  /** A device with an account identity, so the graph the server hands over is taken. */
  async function signedIn() {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["wrapKey", "unwrapKey"],
    );

    holdIdentity(pair.privateKey);
    holdKeyring(new Map(), { keys: [], wraps: [], grants: [] });
  }

  const sharedTwig = (id: string) => ({
    store: "twigs",
    id,
    updatedAt: 5,
    deletedAt: null,
    keyId: "shared-key",
    encryption: "none",
    payload: btoa(
      JSON.stringify({
        id,
        branchId: "b",
        title: "Shared task",
        createdAt: 1,
        updatedAt: 5,
        deletedAt: null,
      }),
    ),
    schedule: null,
  });

  afterEach(async () => {
    holdIdentity(null);
    await (await getNotesDb()).clear("twigs");
  });

  it("fetches what is under a grant it has not seen, and says which rows changed", async () => {
    await signedIn();
    quietServer();

    const backfilled: unknown[] = [];

    server.use(
      http.get(`${BASE}/v1/keys/graph`, () =>
        HttpResponse.json({
          keys: [],
          wraps: [],
          grants: [{ keyId: "shared-key", role: "reader", wrapped: "not-openable" }],
        }),
      ),
      http.post(`${BASE}/v1/sync/backfill`, async ({ request }) => {
        backfilled.push(await request.json());

        return HttpResponse.json({ seq: 9, rows: [sharedTwig("t-1")], hasMore: false });
      }),
    );

    const heard = vi.fn();
    const stop = subscribeToSyncChanges(heard);

    await runSyncRound();

    expect(backfilled).toEqual([{ keyIds: ["shared-key"], after: 0 }]);
    expect(heard).toHaveBeenCalledWith([{ store: "twigs", id: "t-1" }]);

    // Known now: the next round asks for nothing, and nobody is told of nothing.
    heard.mockClear();
    await runSyncRound();

    expect(backfilled).toHaveLength(1);
    expect(heard).not.toHaveBeenCalled();

    stop();
  });

  it("carries on with the round when the backfill cannot be had", async () => {
    await signedIn();
    quietServer();
    server.use(
      http.get(`${BASE}/v1/keys/graph`, () =>
        HttpResponse.json({
          keys: [],
          wraps: [],
          grants: [{ keyId: "shared-key", role: "reader", wrapped: "not-openable" }],
        }),
      ),
      http.post(`${BASE}/v1/sync/backfill`, () => new HttpResponse(null, { status: 500 })),
    );

    expect(await runSyncRound()).not.toBeNull();
  });

  it("stops telling a listener that has stopped listening", async () => {
    quietServer();
    server.use(
      http.post(`${BASE}/v1/sync`, () =>
        HttpResponse.json({ seq: 1, rows: [sharedTwig("t-2")], hasMore: false }),
      ),
    );

    const heard = vi.fn();

    subscribeToSyncChanges(heard)();
    await runSyncRound();

    expect(heard).not.toHaveBeenCalled();
  });
});

describe("the live channel", () => {
  function liveSocket() {
    const listeners: {
      type: string;
      listener: (event: { data: unknown; code: number }) => void;
    }[] = [];

    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: (
        type: "open" | "message" | "close",
        listener: (event: { data: unknown; code: number }) => void,
      ) => {
        listeners.push({ type, listener });
      },
    };

    return {
      create: () => socket,
      nudge: () => {
        for (const entry of listeners.filter((each) => each.type === "message")) {
          entry.listener({ data: JSON.stringify({ type: "changed" }), code: 0 });
        }
      },
    };
  }

  it("runs a round the moment the server says something changed", async () => {
    let syncs = 0;

    quietServer(() => (syncs += 1));

    const socket = liveSocket();
    const onRound = vi.fn();
    const sync = startBackgroundSync({ everyMs: 60_000, onRound, liveSocket: socket.create });

    socket.nudge();
    await until(() => onRound.mock.calls.length === 1, "the nudged round");

    expect(syncs).toBe(1);
    sync.stop();
  });

  it("runs once more when nudged mid-round, since that round may have missed it", async () => {
    let syncs = 0;
    let release: () => void = () => undefined;

    server.use(
      http.post(`${BASE}/v1/sync`, async () => {
        syncs += 1;

        if (syncs === 1) {
          await new Promise<void>((resolve) => (release = resolve));
        }

        return HttpResponse.json({ seq: 0, rows: [], hasMore: false });
      }),
      http.get(`${BASE}/v1/media`, () => HttpResponse.json({ media: [] })),
    );

    const socket = liveSocket();
    const onRound = vi.fn();
    const sync = startBackgroundSync({ everyMs: 60_000, onRound, liveSocket: socket.create });

    socket.nudge();
    await until(() => syncs === 1, "the first round to start");
    socket.nudge();
    socket.nudge();
    release();

    await until(() => onRound.mock.calls.length === 2, "exactly one more round");
    await rest(20);

    expect(syncs).toBe(2);
    sync.stop();
  });

  it("ignores a nudge while the tab is hidden, and after it has stopped", async () => {
    let syncs = 0;

    quietServer(() => (syncs += 1));

    const socket = liveSocket();
    const sync = startBackgroundSync({ everyMs: 60_000, liveSocket: socket.create });

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    socket.nudge();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });

    sync.stop();
    socket.nudge();
    await rest(20);

    expect(syncs).toBe(0);
  });

  it("opens the browser's socket by default, and none when told not to", () => {
    const Native = vi.fn(function () {
      return { send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
    });

    vi.stubGlobal("WebSocket", Native);

    startBackgroundSync({ liveSocket: false }).stop();
    expect(Native).not.toHaveBeenCalled();

    startBackgroundSync().stop();
    expect(Native).toHaveBeenCalledWith("wss://cuervo.example.com/v1/live");
  });
});
