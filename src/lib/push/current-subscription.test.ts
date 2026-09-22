import { afterEach, describe, expect, it, vi } from "vitest";

import { currentPushSubscription } from "./subscribe";

/**
 * jsdom has no service worker and no push manager, so the browser's half of this has to be
 * stood up by hand. What is being tested is the answer this gives the settings screen:
 * "cannot", "not yet" and "already" are three different things and only one of them is a
 * reason to hide the switch.
 */
function withPushSupport(getSubscription: () => Promise<unknown>) {
  vi.stubGlobal("Notification", { requestPermission: () => Promise.resolve("granted") });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("navigator", {
    serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("currentPushSubscription", () => {
  it("says the browser cannot do it at all", async () => {
    // Nothing stubbed: jsdom as it comes, which is a browser without push.
    expect(await currentPushSubscription()).toBe("unsupported");
  });

  it("says there is no subscription yet", async () => {
    withPushSupport(() => Promise.resolve(null));

    expect(await currentPushSubscription()).toBe(false);
  });

  it("says there is one already, without asking for permission", async () => {
    const requestPermission = vi.fn();

    withPushSupport(() => Promise.resolve({ endpoint: "https://push.example.com/abc" }));
    vi.stubGlobal("Notification", { requestPermission });

    expect(await currentPushSubscription()).toBe(true);
    // Reading the state must not prompt: the card renders on every visit to settings.
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("says no rather than throwing when the registration is not there", async () => {
    withPushSupport(() => Promise.reject(new Error("no registration")));

    expect(await currentPushSubscription()).toBe(false);
  });
});
