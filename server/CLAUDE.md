# Server — rules for `server/`

The root `CLAUDE.md` is written for the web app: React layers, 150-line components, "no
React imports in `lib/`". None of that governs an HTTP handler. These rules do. Where this
file is silent, the root one still applies — naming, comments, Conventional Commits, the
definition of done, and every §1 Absolute Directive.

## 1. What this server is

A row store with a scheduler, and nothing more. It holds ciphertext it cannot open and the
few plaintext columns it needs to do its job. `BACKEND.md` is the design; this is how to
write it.

*   **It never sees a passphrase, a content key, or a note.** `[REQUIRED]` If a change
    would give it any of those, the change is wrong. Look for the mistake in the client.
*   **It does not model the hierarchy.** `[REQUIRED]` No tables for wings, flights or
    branches. It cannot read their names, so such a table would carry no information and
    one more thing to keep in step.
*   **Every stored string from a client is opaque.** Validate the shape, never the meaning.

## 2. Layout

| Path | Holds |
| --- | --- |
| `server/src/app.ts` | CORS, the rate limiter, and the route groups mounted over one database. |
| `server/src/*-routes.ts` | Hono routes for one area: `auth`, `sync`, `sharing`. Parse, authorise, delegate, respond. No logic. |
| `server/src/http.ts` | The one error shape (`fail`) and the one session check (`callerFor`). |
| `server/src/*.ts` | One concern each: `accounts`, `tokens`, `db`, `rate-limit`, `sync`, `sharing`, `reminders`, `push`, `zoned-time`. |
| `shared/` | The wire contract, imported by the client too. Zod only, no runtime. |

*   Paths are absolute in each group (`/v1/auth/…`, `/v1/keys/…`), so the groups mount at
    the root. Splitting them was about keeping each file readable, not about prefixes.
*   **A route group never builds its own refusal.** `[REQUIRED]` `fail()` is the only way to
    say no, so a new area cannot quietly grow a second error shape or leak a distinction
    the others hide.

*   The database is **passed in**, never reached for. `createApp({ sql })` is what lets the
    tests run against a real Postgres in-process. `[REQUIRED]`
*   `Sql` is the whole database interface: one parameterised query. `pg` satisfies it in
    production and `@electric-sql/pglite` in tests, so the SQL under test is the SQL that
    ships.
*   Files over **300 lines** split by responsibility, as in `src/`. `[ENFORCED]`

## 3. Security rules

*   **Parameterised queries only.** `[REQUIRED]` No string interpolation into SQL, ever,
    including for identifiers. Check: ``grep -nE 'query\(`[^`]*\$\{' server/src/*.ts`` →
    nothing.
*   **One error shape, and no more detail than the caller can act on.** `[REQUIRED]` An
    address with no account and the wrong proof for one that exists return the same thing;
    telling them apart is a list of who has an account.
*   **Anything keyed by an address answers for every address.** `[REQUIRED]` `prelogin`
    returns decoy parameters derived from the address and the server secret — stable per
    address, indistinguishable from a real one.
*   **Never compare a secret with `===`.** `[REQUIRED]` A proof goes through Argon2's own
    `verify`, which is constant-time. A token is not compared at all: it is hashed and
    looked up by primary key.
*   **Store tokens hashed, proofs slow-hashed.** A token is 256 random bits, so SHA-256 is
    enough and a slow hash would only make every request expensive. A proof gets Argon2id
    because a leaked table should not be a pile of working credentials.
*   **Rate-limit anything that takes a guess.** The limiter is per-process, which is honest
    for one instance and is the thing to replace first when there are two.
*   `no-console` is **off** here — a service that cannot log is not operable. Never log a
    token, an `authKey`, a sealed blob, or an email beside either.

## 4. Testing

*   Same toolchain as the app: Vitest, run by `npm run test` from the root. Server suites
    open with `// @vitest-environment node`.
*   **Against a real database.** `createTestDb()` gives a fresh PGlite per test; no mock of
    a database, ever, because a mock accepts SQL that Postgres rejects. `[REQUIRED]`
*   Drive routes through `app.request()` rather than binding a port.
*   A security property gets a test that fails without it: that the two sign-in failures
    are identical, that a decoy is stable, that a changed passphrase drops other sessions.

## 5. Configuration

Read from the environment, and fail at startup if something required is missing — never
fall back to a default for a secret. `[REQUIRED]`

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Postgres. |
| `SERVER_SECRET` | Decoy KDF parameters derive from it, so it must outlive a restart or the decoys change and become the tell they exist to avoid. |
| `ALLOWED_ORIGINS` | Comma-separated, for CORS. |

## 6. Not built yet

`@hono/node-server` is needed to bind a port; the app is a `Hono` instance and every test
drives it directly, so nothing depends on it until there is somewhere to deploy. Phases 1
to 4 of `BACKEND.md` — accounts, sync, reminders and sharing — are written and tested;
what is left is listed at the end of that file.
