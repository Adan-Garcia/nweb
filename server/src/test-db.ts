import { PGlite } from "@electric-sql/pglite";

import { migrate, type Sql } from "./db";

/**
 * A real Postgres, in this process.
 *
 * The alternative is a mock of a database, which would let every one of these tests pass
 * against SQL that Postgres would reject. PGlite runs the same engine the server talks to,
 * so the schema and the queries below are the ones that ship.
 */
export async function createTestDb(): Promise<Sql & { close: () => Promise<void> }> {
  const pglite = new PGlite();

  const sql: Sql = {
    query: async <T>(text: string, params?: unknown[]) => {
      const result = await pglite.query<T>(text, params);

      return { rows: result.rows };
    },
  };

  await migrate(sql);

  return { ...sql, close: () => pglite.close() };
}
