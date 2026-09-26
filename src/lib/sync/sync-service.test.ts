import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setApiSession } from "@/lib/api/session-store";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/cipher";
import { createObjectKey, type Keyring } from "@/lib/keys/key-graph";
import {
  forgetKeyring,
  holdKeyring,
  keysNeedUpload,
  markKeysUploaded,
} from "@/lib/keys/object-keys";
import { server } from "@/test/server";

import { resetSyncState, runSyncRound, startBackgroundSync } from "./sync-service";

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
