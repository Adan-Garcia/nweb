import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiSession, setApiSession, subscribeToApiSession } from "./session-store";

afterEach(() => {
  setApiSession(null);
});

describe("the session store", () => {
  it("starts empty, because a token is never read back off disk", () => {
    expect(getApiSession()).toBeNull();
  });

  it("holds what it is given and hands it back", () => {
    setApiSession({ baseUrl: "https://cuervo.example.com", token: "a-token" });

    expect(getApiSession()).toEqual({ baseUrl: "https://cuervo.example.com", token: "a-token" });
  });

  it("tells every listener when it changes", () => {
    const first = vi.fn();
    const second = vi.fn();

    subscribeToApiSession(first);
    subscribeToApiSession(second);
    setApiSession({ baseUrl: "https://cuervo.example.com", token: "a-token" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener that unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToApiSession(listener);

    unsubscribe();
    setApiSession({ baseUrl: "https://cuervo.example.com", token: "a-token" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("reports a sign-out like any other change", () => {
    const listener = vi.fn();

    setApiSession({ baseUrl: "https://cuervo.example.com", token: "a-token" });
    subscribeToApiSession(listener);
    setApiSession(null);

    expect(getApiSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
