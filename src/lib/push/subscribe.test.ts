import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/server";

import { decodeVapidKey, subscribeToPush, unsubscribeFromPush } from "./subscribe";

const SESSION = { baseUrl: "https://api.example", token: "a-token" };
const VAPID =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

type Subscription = {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: () => Promise<boolean>;
};

function fakeSubscription(endpoint = "https://push.example/abc"): Subscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "a-key", auth: "an-auth" } }),
    unsubscribe: () => Promise.resolve(true),
  };
}

/** A browser that supports push, with whatever the test needs it to say. */
function givenBrowser({
  permission = "granted",
  existing = null,
  subscribe,
}: {
  permission?: NotificationPermission;
  existing?: Subscription | null;
  subscribe?: () => Promise<Subscription>;
} = {}) {
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(existing)),
    subscribe: vi.fn(subscribe ?? (() => Promise.resolve(fakeSubscription()))),
  };

  vi.stubGlobal("Notification", {
    requestPermission: vi.fn(() => Promise.resolve(permission)),
  });
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });

  return pushManager;
}

beforeEach(() => {
  server.use(
    http.post(
      "https://api.example/v1/push/subscribe",
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      "https://api.example/v1/push/subscribe",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("decodeVapidKey", () => {
  it("reads the base64url a VAPID key travels as", () => {
    const bytes = decodeVapidKey(VAPID);

    // An uncompressed P-256 point: 65 bytes starting with 0x04.
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe("subscribeToPush", () => {
  it("asks the browser, then tells the server where to reach it", async () => {
    let sent: unknown;
    server.use(
      http.post("https://api.example/v1/push/subscribe", async ({ request }) => {
        sent = await request.json();

        return new HttpResponse(null, { status: 204 });
      }),
    );
    givenBrowser();

    expect(await subscribeToPush(SESSION, VAPID)).toBe("subscribed");
    expect(sent).toEqual({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "a-key", auth: "an-auth" },
    });
  });

  it("reuses a subscription this browser already has", async () => {
    const existing = fakeSubscription("https://push.example/already");
    const pushManager = givenBrowser({ existing });

    expect(await subscribeToPush(SESSION, VAPID)).toBe("subscribed");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("asks for a visible notification, which is what makes the permission honest", async () => {
    const pushManager = givenBrowser();

    await subscribeToPush(SESSION, VAPID);

    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
  });

  it("stops at a refusal rather than subscribing anyway", async () => {
    const pushManager = givenBrowser({ permission: "denied" });

    expect(await subscribeToPush(SESSION, VAPID)).toBe("denied");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("reports a browser that cannot do this at all", async () => {
    expect(await subscribeToPush(SESSION, VAPID)).toBe("unsupported");
  });

  it("reports a browser that changed its mind halfway", async () => {
    givenBrowser({ subscribe: () => Promise.reject(new Error("no")) });

    expect(await subscribeToPush(SESSION, VAPID)).toBe("failed");
  });

  it("reports a subscription that is not one", async () => {
    givenBrowser({
      subscribe: () =>
        Promise.resolve({
          endpoint: "not a url",
          toJSON: () => ({ endpoint: "not a url" }),
          unsubscribe: () => Promise.resolve(true),
        }),
    });

    expect(await subscribeToPush(SESSION, VAPID)).toBe("failed");
  });

  it("reports a server that would not take it", async () => {
    server.use(http.post("https://api.example/v1/push/subscribe", () => HttpResponse.error()));
    givenBrowser();

    expect(await subscribeToPush(SESSION, VAPID)).toBe("failed");
  });
});

describe("unsubscribeFromPush", () => {
  it("tells the server to stop and drops the subscription here", async () => {
    let told = false;
    server.use(
      http.delete("https://api.example/v1/push/subscribe", () => {
        told = true;

        return new HttpResponse(null, { status: 204 });
      }),
    );
    givenBrowser({ existing: fakeSubscription() });

    expect(await unsubscribeFromPush(SESSION)).toBe(true);
    expect(told).toBe(true);
  });

  it("does nothing when there is nothing to stop", async () => {
    givenBrowser({ existing: null });

    expect(await unsubscribeFromPush(SESSION)).toBe(false);
  });

  it("reports a browser that cannot do this, and one that threw", async () => {
    expect(await unsubscribeFromPush(SESSION)).toBe(false);

    givenBrowser();
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        get ready() {
          return Promise.reject(new Error("no worker"));
        },
      },
      configurable: true,
    });

    expect(await unsubscribeFromPush(SESSION)).toBe(false);
  });
});
