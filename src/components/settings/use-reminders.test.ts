import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiSession } from "@/lib/api/client";
import * as push from "@/lib/push/subscribe";
import { server } from "@/test/server";

import { useReminders } from "./use-reminders";

const BASE = "https://cuervo.example.com";
const KEY = "a-vapid-public-key";

const signedIn: ApiSession = { baseUrl: BASE, token: "a-token" };
const sessionFor = () => signedIn;

function serverWithKey(publicKey: string | null) {
  server.use(http.get(`${BASE}/v1/push/key`, () => HttpResponse.json({ publicKey })));
}

beforeEach(() => {
  // jsdom has no push manager, so what the browser would answer is stubbed per test.
  vi.spyOn(push, "currentPushSubscription").mockResolvedValue(false);
});

describe("useReminders", () => {
  it("offers nothing when this build has no server to ask", async () => {
    const { result } = renderHook(() => useReminders(() => null));

    await waitFor(() => {
      expect(result.current.state).toBe("unavailable");
    });
  });

  it("offers nothing when the deployment sends no reminders", async () => {
    serverWithKey(null);

    const { result } = renderHook(() => useReminders(sessionFor));

    // Nothing is wrong: the server simply has no push keys configured.
    await waitFor(() => {
      expect(result.current.state).toBe("unavailable");
    });
  });

  it("offers nothing when the server cannot be asked", async () => {
    server.use(http.get(`${BASE}/v1/push/key`, () => HttpResponse.error()));

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("unavailable");
    });
  });

  it("says so when this browser cannot do push at all", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "currentPushSubscription").mockResolvedValue("unsupported");

    const { result } = renderHook(() => useReminders(sessionFor));

    // A switch that could never work is worse than an explanation.
    await waitFor(() => {
      expect(result.current.state).toBe("unsupported");
    });
  });

  it("is off when there is a key and no subscription", async () => {
    serverWithKey(KEY);

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
  });

  it("is on when the browser already holds a subscription", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "currentPushSubscription").mockResolvedValue(true);

    const { result } = renderHook(() => useReminders(sessionFor));

    // Read back rather than remembered: a subscription can be dropped from outside this
    // app, and a remembered "on" would be a lie.
    await waitFor(() => {
      expect(result.current.state).toBe("on");
    });
  });

  it("turns on with the key the server published", async () => {
    serverWithKey(KEY);
    const subscribe = vi.spyOn(push, "subscribeToPush").mockResolvedValue("subscribed");

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
    await act(async () => {
      await result.current.enable();
    });

    expect(subscribe).toHaveBeenCalledWith(signedIn, KEY);
    expect(result.current.state).toBe("on");
  });

  it("reports a refusal as a refusal, not as a failure", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "subscribeToPush").mockResolvedValue("denied");

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
    await act(async () => {
      await result.current.enable();
    });

    // The browser will not ask again, so the card has to say where to change it back.
    expect(result.current.state).toBe("denied");
  });

  it("falls back to off when subscribing simply fails", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "subscribeToPush").mockResolvedValue("failed");

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.state).toBe("off");
  });

  it("reports a browser that stopped supporting it mid-flight", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "subscribeToPush").mockResolvedValue("unsupported");

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.state).toBe("unsupported");
  });

  it("turns off again", async () => {
    serverWithKey(KEY);
    vi.spyOn(push, "currentPushSubscription").mockResolvedValue(true);
    const unsubscribe = vi.spyOn(push, "unsubscribeFromPush").mockResolvedValue(true);

    const { result } = renderHook(() => useReminders(sessionFor));

    await waitFor(() => {
      expect(result.current.state).toBe("on");
    });
    await act(async () => {
      await result.current.disable();
    });

    expect(unsubscribe).toHaveBeenCalledWith(signedIn);
    expect(result.current.state).toBe("off");
  });

  it("does nothing either way without a session to act through", async () => {
    serverWithKey(KEY);
    const subscribe = vi.spyOn(push, "subscribeToPush");
    const unsubscribe = vi.spyOn(push, "unsubscribeFromPush");
    const withoutToken = () => ({ baseUrl: BASE });

    const { result } = renderHook(() => useReminders(withoutToken));

    await waitFor(() => {
      expect(result.current.state).toBe("off");
    });
    await act(async () => {
      await result.current.enable();
      await result.current.disable();
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
