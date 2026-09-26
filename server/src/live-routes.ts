import type { upgradeWebSocket } from "@hono/node-server";
import {
  LIVE_CLOSE_UNAUTHORIZED,
  liveClientMessageSchema,
  type LiveServerMessage,
} from "@shared/live-contract";
import { Hono } from "hono";

import type { Sql } from "./db";
import { callerFor } from "./http";
import type { LiveHub } from "./live";

/** One connection's side of the conversation, apart from the socket library. */
export type LiveConnection = {
  send: (data: string) => void;
  close: (code: number) => void;
};

/**
 * What one socket does: wait for a session token, check it, then stay registered until it
 * closes. Anything before a valid token is ignored rather than answered — the socket is
 * closed on a bad token and on nothing else, so a slow client is not punished for it.
 *
 * Kept apart from the route so it can be driven without a socket at all.
 */
export function liveSession({ sql, hub }: { sql: Sql; hub: LiveHub }) {
  let leave: (() => void) | null = null;
  let closed = false;

  return {
    async onMessage(data: unknown, connection: LiveConnection): Promise<void> {
      if (leave || typeof data !== "string") {
        return;
      }

      let parsed: ReturnType<typeof liveClientMessageSchema.safeParse>;

      try {
        parsed = liveClientMessageSchema.safeParse(JSON.parse(data) as unknown);
      } catch {
        return;
      }

      if (!parsed.success) {
        return;
      }

      const caller = await callerFor(sql, `Bearer ${parsed.data.token}`);

      if (!caller) {
        connection.close(LIVE_CLOSE_UNAUTHORIZED);
        return;
      }

      // The socket may have gone while the session was being looked up; registering it then
      // would leave a dead entry nobody removes.
      if (closed) {
        return;
      }

      leave = hub.join(caller.user.id, { send: connection.send });
      connection.send(JSON.stringify({ type: "ready" } satisfies LiveServerMessage));
    },

    onClose(): void {
      closed = true;
      leave?.();
      leave = null;
    },
  };
}

/** `GET /v1/live`, mounted only when the process was started with a WebSocket server. */
export function liveRoutes({
  sql,
  hub,
  upgrade,
}: {
  sql: Sql;
  hub: LiveHub;
  upgrade: typeof upgradeWebSocket;
}) {
  const routes = new Hono();

  routes.get(
    "/v1/live",
    upgrade(() => {
      const session = liveSession({ sql, hub });

      return {
        onMessage(event: { data: unknown }, ws) {
          void session.onMessage(event.data, {
            send: (data) => {
              ws.send(data);
            },
            close: (code) => {
              ws.close(code);
            },
          });
        },
        onClose() {
          session.onClose();
        },
      };
    }),
  );

  return routes;
}
