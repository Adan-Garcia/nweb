import { LIVE_CLOSE_UNAUTHORIZED, liveServerMessageSchema } from "@shared/live-contract";

import type { ApiSession } from "../api/client";

/**
 * The client end of the live channel: a WebSocket that says "sync now".
 *
 * It never carries a row. A nudge only makes the ordinary sync round run early, so every
 * change still arrives sealed, validated and merged through the one path that does that —
 * and a channel that is down, or a server that has none, costs latency and nothing else,
 * because the periodic round keeps running either way.
 *
 * Reconnects back off from `retryMs` to `maxRetryMs`, and start again from the bottom once
 * the server has accepted the session.
 */
export type LiveSocketLike = {
  send: (data: string) => void;
  close: () => void;
  addEventListener: {
    (type: "open", listener: () => void): void;
    (type: "message", listener: (event: { data: unknown }) => void): void;
    (type: "close", listener: (event: { code: number }) => void): void;
  };
};

export type LiveChannelOptions = {
  /** Read on every connect, so a session that arrives or changes later is picked up. */
  session: () => ApiSession | null;
  onNudge: () => void;
  createSocket?: (url: string) => LiveSocketLike;
  retryMs?: number;
  maxRetryMs?: number;
};

export type LiveChannel = { stop: () => void };

/** `https://host/api` becomes `wss://host/api/v1/live`, and `http` becomes `ws`. */
export function liveUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, "ws")}/v1/live`;
}

function parse(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = liveServerMessageSchema.safeParse(JSON.parse(data) as unknown);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function openLiveChannel({
  session,
  onNudge,
  createSocket = (url) => new WebSocket(url),
  retryMs = 2_000,
  maxRetryMs = 60_000,
}: LiveChannelOptions): LiveChannel {
  let socket: LiveSocketLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = retryMs;
  let stopped = false;

  const retry = (wait: number) => {
    if (!stopped) {
      timer = setTimeout(connect, wait);
      delay = Math.min(delay * 2, maxRetryMs);
    }
  };

  function connect() {
    timer = null;
    const current = session();

    if (!current?.token) {
      retry(maxRetryMs);
      return;
    }

    const token = current.token;
    const opened = createSocket(liveUrl(current.baseUrl));

    socket = opened;

    opened.addEventListener("open", () => {
      opened.send(JSON.stringify({ type: "auth", token }));
    });

    opened.addEventListener("message", (event) => {
      const message = parse(event.data);

      if (message?.type === "ready") {
        delay = retryMs;
      } else if (message?.type === "changed") {
        onNudge();
      }
    });

    opened.addEventListener("close", (event) => {
      if (socket === opened) {
        socket = null;
        // A refused session will be refused again until it changes; wait the longest.
        retry(event.code === LIVE_CLOSE_UNAUTHORIZED ? maxRetryMs : delay);
      }
    });
  }

  connect();

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      const open = socket;

      socket = null;
      open?.close();
    },
  };
}
