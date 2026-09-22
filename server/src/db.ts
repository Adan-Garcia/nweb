/**
 * The little of a database this server needs.
 *
 * `Sql` is the whole interface: one parameterised query. `pg` satisfies it in production
 * and `@electric-sql/pglite` satisfies it in tests, which is why the tests run against real
 * Postgres rather than a mock of one — the SQL below is the SQL that ships.
 */
export type Sql = {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Applied statement by statement rather than as one script, because a multi-statement
 * query is a simple query and not every driver will take one.
 *
 * What the server stores is what it cannot read: a hash of the proof, and four opaque
 * strings. There is no column here for anything it could open.
 */
export const SCHEMA_STATEMENTS = [
  `create table if not exists users (
     id uuid primary key default gen_random_uuid(),
     email text not null unique,
     auth_hash text not null,
     kdf jsonb not null,
     sealed_account_key text not null,
     public_key text not null,
     sealed_private_key text not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id uuid not null references users(id) on delete cascade,
     expires_at timestamptz not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists sessions_user_id_idx on sessions (user_id)`,
  `create index if not exists sessions_expires_at_idx on sessions (expires_at)`,
] as const;

export async function migrate(sql: Sql): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await sql.query(statement);
  }
}

/**
 * An address identifies an account, so it has to identify exactly one. Postgres compares
 * text byte by byte, which would let `A@b.com` and `a@b.com` both be registered.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
