import { LIVE_CLOSE_UNAUTHORIZED } from "@shared/live-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LiveSocketLike, liveUrl, openLiveChannel } from "./live-channel";

type SocketEvent = { data: unknown; code: number };

/** A socket the test drives by hand: it records what was sent and fires what it is told. */
function fakeSocket(url: string) {
  const listeners: { type: string; listener: (event: SocketEvent) => void }[] = [];
  const sent: string[] = [];

  return {
    url,
    sent,
    close: vi.fn(),
    send: (data: string) => void sent.push(data),
    addEventListener: (
      type: "open" | "message" | "close",
      listener: (event: SocketEvent) => void,
    ) => {
      listeners.push({ type, listener });
    },
    fire(type: "open" | "message" | "close", event: Partial<SocketEvent> = {}) {
      for (const entry of listeners.filter((each) => each.type === type)) {
        entry.listener({ data: event.data, code: event.code ?? 1000 });
      }
    },
  };
}

type Fake = ReturnType<typeof fakeSocket>;

let sockets: Fake[];
const createSocket = (url: string): LiveSocketLike => {
  const socket = fakeSocket(url);

  sockets.push(socket);
  return socket;
};

const SESSION = { baseUrl: "https://api.example", token: "a-token" };

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("liveUrl", () => {
  it("turns the API address into a WebSocket one, secure stays secure", () => {
    expect(liveUrl("https://api.example/base")).toBe("wss://api.example/base/v1/live");
    expect(liveUrl("http://localhost:8787")).toBe("ws://localhost:8787/v1/live");
  });
});

describe("openLiveChannel", () => {
  it("sends the session token first, and nudges on 'changed'", () => {
    const onNudge = vi.fn();
    const channel = openLiveChannel({ session: () => SESSION, onNudge, createSocket });

    sockets[0].fire("open");
    expect(sockets[0].sent).toEqual([JSON.stringify({ type: "auth", token: "a-token" })]);

    sockets[0].fire("message", { data: JSON.stringify({ type: "ready" }) });
    expect(onNudge).not.toHaveBeenCalled();

    sockets[0].fire("message", { data: JSON.stringify({ type: "changed" }) });
    expect(onNudge).toHaveBeenCalledTimes(1);

    channel.stop();
    expect(sockets[0].close).toHaveBeenCalled();
  });

  it("ignores anything that is not a message it knows", () => {
    const onNudge = vi.fn();

    openLiveChannel({ session: () => SESSION, onNudge, createSocket });

    for (const data of ["nope", JSON.stringify({ type: "other" }), new Uint8Array([1])]) {
      sockets[0].fire("message", { data });
    }

    expect(onNudge).not.toHaveBeenCalled();
  });

  it("reconnects after a drop, backing off, and starts over once accepted", () => {
    openLiveChannel({
      session: () => SESSION,
      onNudge: vi.fn(),
      createSocket,
      retryMs: 100,
      maxRetryMs: 1_000,
    });

    sockets[0].fire("close", { code: 1006 });
    vi.advanceTimersByTime(99);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    // Twice as long the second time.
    sockets[1].fire("close", { code: 1006 });
    vi.advanceTimersByTime(199);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    // Accepted: the next drop waits the shortest time again.
    sockets[2].fire("message", { data: JSON.stringify({ type: "ready" }) });
    sockets[2].fire("close", { code: 1006 });
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(4);
  });

  it("waits the longest after a refused session, and does nothing without one", () => {
    let session: typeof SESSION | null = null;

    openLiveChannel({
      session: () => session,
      onNudge: vi.fn(),
      createSocket,
      retryMs: 100,
      maxRetryMs: 1_000,
    });

    expect(sockets).toHaveLength(0);

    session = SESSION;
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(1);

    sockets[0].fire("close", { code: LIVE_CLOSE_UNAUTHORIZED });
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  it("stays stopped: no reconnect, and a late close does nothing", () => {
    const channel = openLiveChannel({
      session: () => null,
      onNudge: vi.fn(),
      createSocket,
      retryMs: 100,
      maxRetryMs: 1_000,
    });

    channel.stop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(0);

    const again = openLiveChannel({ session: () => SESSION, onNudge: vi.fn(), createSocket });

    again.stop();
    sockets[0].fire("close", { code: 1000 });
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
  });

  it("uses the browser's WebSocket when none is given", () => {
    const Native = vi.fn(function (this: object, url: string) {
      return createSocket(url);
    });

    vi.stubGlobal("WebSocket", Native);

    try {
      openLiveChannel({ session: () => SESSION, onNudge: vi.fn() }).stop();
      expect(Native).toHaveBeenCalledWith("wss://api.example/v1/live");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
