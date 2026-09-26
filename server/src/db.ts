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

/** Postgres hands back `bigint` as a string, because it does not fit a JS number safely. */
export function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

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
  /*
   * One sequence for every row of every user. It is what a device asks "what is new to
   * me" with, and it has to be the server's: two laptops disagree about the time, and a
   * cursor built from their clocks would skip edits or repeat them forever.
   */
  `create sequence if not exists rows_seq`,
  `create table if not exists rows (
     user_id uuid not null references users(id) on delete cascade,
     store text not null,
     id text not null,
     seq bigint not null default nextval('rows_seq'),
     updated_at bigint not null,
     deleted_at bigint,
     key_id text not null default '',
     encryption text not null default 'none',
     payload text not null,
     due_date text,
     due_minutes int,
     time_zone text,
     status text,
     primary key (user_id, store, id)
   )`,
  `create index if not exists rows_user_seq_idx on rows (user_id, seq)`,
  /* What the reminder sweep reads, and the only index that is about meaning. */
  `create index if not exists rows_due_idx on rows (due_date)
     where due_date is not null and deleted_at is null`,
  `create table if not exists keys (
     id text primary key,
     owner_id uuid not null references users(id) on delete cascade,
     kind text not null,
     rotated_from text,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists key_wraps (
     parent_key_id text not null,
     child_key_id text not null,
     wrapped text not null,
     primary key (parent_key_id, child_key_id)
   )`,
  `create index if not exists key_wraps_parent_idx on key_wraps (parent_key_id)`,
  `create table if not exists grants (
     key_id text not null,
     user_id uuid not null references users(id) on delete cascade,
     role text not null,
     wrapped text not null,
     primary key (key_id, user_id)
   )`,
  `create index if not exists grants_user_idx on grants (user_id)`,
  `create table if not exists push_subscriptions (
     user_id uuid not null references users(id) on delete cascade,
     endpoint text not null,
     p256dh text not null,
     auth text not null,
     created_at timestamptz not null default now(),
     primary key (user_id, endpoint)
   )`,
  /* When this row was last spoken about, so a reminder is sent once and not every sweep. */
  `alter table rows add column if not exists reminded_at bigint`,
  `create table if not exists media (
     user_id uuid not null references users(id) on delete cascade,
     id text not null,
     seq bigint not null default nextval('rows_seq'),
     mime_type text not null,
     created bigint not null,
     updated_at bigint not null,
     key_id text not null default '',
     encryption text not null default 'none',
     bytes bytea not null,
     primary key (user_id, id)
   )`,
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
