# Server — rules for `server/`

The root `CLAUDE.md` is written for the web app: React layers, 150-line components, "no
React imports in `lib/`". None of that governs an HTTP handler. These rules do. Where this
file is silent, the root one still applies — naming, comments, Conventional Commits, the
definition of done, and every §1 Absolute Directive.

## 1. What this server is

A row store with a scheduler, and nothing more. It holds ciphertext it cannot open and the
few plaintext columns it needs to do its job. `docs/backend.md` is the design; this is how to
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
*   **Refusals cost the same as acceptances.** `[REQUIRED]` A sign-in for an address with
    no account still runs one Argon2 verification (against a hash nothing matches), or the
    fast "no" is the tell the identical error bodies were hiding.
*   **A row goes only under a key its writer may write with.** `[REQUIRED]` The store serves
    rows by `key_id` to everyone who can reach that key, so a new row under a key someone
    else owns and the caller cannot write would be planted in their course (`sync.ts`,
    `foreignKeyIds`). A key nobody has registered yet is allowed; `putKeys` keeps the first
    owner of an id.
*   **The server calls out only to public https push services.** `[REQUIRED]` A stored push
    endpoint is where the sweep POSTs from inside the server's network, so its name is checked
    with `isPublicPushEndpoint` when saved and before each delivery, and the address it
    resolves to is checked by the connection's own lookup (`public-address.ts`), which a
    public name pointing at a private address, or changing its answer, cannot get past.
*   **Bodies are capped while they stream in** (`app.ts`): 25 MiB for a file, 64 MiB for a
    sync page, 1 MiB for everything else. Account fields and KDF parameters have bounds in
    `shared/`, so nobody can make the server hash a megabyte or store parameters that would
    weaken or stall another device.
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
| `ALLOWED_ORIGINS` | Comma-separated, for CORS. Only needed when the app is served from another origin. |
| `CLIENT_IP_HEADER` | The header a proxy puts the caller's address in (`cf-connecting-ip` behind a Cloudflare Tunnel). Enables the per-address limit. Trust it only when nothing but the proxy can reach the server. |
| `REGISTRATION_EMAILS` | Comma-separated. Only these may register; unset is anyone. |
| `STATIC_DIR` | The built app, served beside the API (`static-app.ts`). The Docker image sets it. |

## 6. Running it

`main.ts` is the composition root and the only file that reaches for the environment, a
socket or a real Postgres. It is excluded from coverage for exactly that reason, and is
kept thin enough to read in one go; everything it wires together is tested without any of
the three.

*   `npm run build:server` bundles it with Vite, because Node can strip types but cannot
    resolve `./app` or `@shared/…`. `npm run start:server` runs the bundle.
*   `web-push` is CommonJS, so it is used through its namespace (`webpush.sendNotification`).
    A named import works from source and fails in the bundle. `[REQUIRED]`
*   The reminder loop is a **chained timeout, never an interval** `[REQUIRED]`: a round that
    outlasts its period must not have a second one started behind it, or the same reminder
    goes out twice.

Phases 1 to 4 of `docs/backend.md` — accounts, sync, reminders and sharing — are written and
tested; what is left is listed at the end of that file.
