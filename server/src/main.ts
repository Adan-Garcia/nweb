import { serve } from "@hono/node-server";
import { Pool, type QueryResultRow } from "pg";

import { createApp } from "./app";
import { ConfigError, readConfig } from "./config";
import { migrate, type Sql } from "./db";
import { configurePush, deliverPush } from "./push";
import { startReminderSweep } from "./runtime";

/**
 * The composition root, and the only file here that reaches for the outside world: the
 * environment, a socket, and a real Postgres. Everything it wires together is tested
 * without any of the three, which is why this file is thin enough to read in one go.
 */
async function main(): Promise<void> {
  const config = readConfig(process.env);
  const pool = new Pool({ connectionString: config.databaseUrl });

  // `pg` wants its row type to extend `QueryResultRow`, and `Sql` promises nothing about
  // the shape. Intersecting the two is the honest bridge: no cast, and the caller still
  // gets back exactly what it asked for.
  const sql: Sql = {
    query: <T>(text: string, values?: unknown[]) => pool.query<QueryResultRow & T>(text, values),
  };

  await migrate(sql);

  if (config.vapid) {
    configurePush(config.vapid);
  } else {
    console.warn("No VAPID keys configured: this server will not send reminders.");
  }

  const sweep = config.vapid
    ? startReminderSweep({
        sql,
        deliver: deliverPush,
        everyMs: config.sweepEveryMs,
        onError: (error) => console.error("A reminder sweep failed.", error),
      })
    : null;

  const app = createApp({
    sql,
    serverSecret: config.serverSecret,
    allowedOrigins: config.allowedOrigins,
    vapidPublicKey: config.vapid?.publicKey ?? null,
  });

  const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) =>
    console.info(`Listening on ${port}.`),
  );

  // Finish what is in flight, then let the process go. Without this a deploy drops
  // whatever request happened to be open.
  const shutdown = () => {
    sweep?.stop();
    server.close(() => void pool.end());
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  // A misconfigured server says what is missing and stops. Anything else is a stack trace,
  // because it is a bug and the trace is the only useful thing about it.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
