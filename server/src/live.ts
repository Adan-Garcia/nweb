import type { LiveServerMessage } from "@shared/live-contract";

import type { Sql } from "./db";
import { reachableKeyIds } from "./key-graph";

/**
 * Who is connected, and who to nudge when rows change.
 *
 * In memory, per process: a nudge is a hint, and one lost to a restart or to a second
 * server process costs the recipient a minute until their periodic sync — never a row. The
 * day this runs as more than one process, this is the piece that needs a shared channel
 * (Postgres `LISTEN/NOTIFY` would do); nothing else about the protocol changes.
 */
export type LiveSocket = { send: (data: string) => void };

export type LiveHub = {
  /** Registers a socket for a user. Returns the function that removes it again. */
  join: (userId: string, socket: LiveSocket) => () => void;
  /**
   * Tells everyone who can read any of `keyIds`, plus the users named outright (the
   * writer's own other devices), that there is something to sync.
   */
  nudge: (sql: Sql, change: { keyIds: string[]; userIds: string[] }) => Promise<number>;
  /** How many sockets are open, for a test or a health check. */
  size: () => number;
};

const CHANGED = JSON.stringify({ type: "changed" } satisfies LiveServerMessage);

export function createLiveHub(): LiveHub {
  const sockets = new Map<string, Set<LiveSocket>>();

  return {
    join(userId, socket) {
      const mine = sockets.get(userId) ?? new Set<LiveSocket>();

      mine.add(socket);
      sockets.set(userId, mine);

      return () => {
        mine.delete(socket);

        if (!mine.size) {
          sockets.delete(userId);
        }
      };
    },

    async nudge(sql, { keyIds, userIds }) {
      const changed = new Set(keyIds);
      let sent = 0;

      for (const [userId, open] of sockets) {
        const named = userIds.includes(userId);
        // Only connected users are asked, so this is one walk per open account per write.
        const reaches =
          !named &&
          changed.size > 0 &&
          (await reachableKeyIds(sql, userId)).some((keyId) => changed.has(keyId));

        if (!named && !reaches) {
          continue;
        }

        for (const socket of open) {
          // A socket that has gone away without saying so throws here; the close handler
          // will remove it, and nobody else should miss their nudge because of it.
          try {
            socket.send(CHANGED);
            sent += 1;
          } catch {
            continue;
          }
        }
      }

      return sent;
    },

    size() {
      let count = 0;

      for (const open of sockets.values()) {
        count += open.size;
      }

      return count;
    },
  };
}
