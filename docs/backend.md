# The backend

Written 2026-09-21, brought up to date 2026-09-27. This is the design for the half of the
app that needs a server: accounts, sync, sharing and push. It says how that part is built,
and why it is shaped the way it is.

Phases 0 to 4 are built and wired into the app: `server/` runs, and Settings → Account &
sync creates an account, syncs, shares and turns on push reminders. What is left is listed
under "What is still missing" at the end. This document replaced an earlier `Todo.md`,
which described a different architecture (Supabase, and Zustand for core data) than the one
that shipped.

## What the client already decided

The server does not get to read anything. Note content, drawings, file bytes and every
display name — note titles, course names, task titles, file names — are sealed on the
device before they are stored (`lib/crypto/sealed-text.ts`, `lib/crypto/cipher.ts`). What is left in the
clear is when things happen: a twig's due date and time, its status, and every timestamp.

That was chosen so a server holding nothing but ciphertext could still say "something is
due at nine". It also decides almost everything below:

*   **The server is a row store with a scheduler.** It cannot understand the hierarchy, so
    it must not model it. One table of opaque rows, plus the few plaintext columns it
    needs to send a reminder.
*   **Conflict resolution happens on the client.** The server cannot merge ciphertext. It
    orders writes; the client decides which one wins.
*   **Sharing is key distribution, not permissions.** Row-level security decides who can
    *download* a blob. Only a key decides who can *read* one. Both are needed, and the
    second is the one that matters.

## The key model

Sharing has to work at any level of the hierarchy: a whole wing, one flight, one course,
one tag, or a single note handed to one person. That rules out a key per workspace, and it
rules out a key per level, because a nest is a tag — a note can sit in two of them — so the
containment graph is a DAG and not a tree.

The model that survives this is envelope encryption over that DAG:

*   **Every leaf gets its own data key.** A feather, a twig, a pebble: one random AES-GCM
    key each, used for that object's content and its name and nothing else.
*   **Every container gets a key-encryption key.** A wing, flight, branch and nest each
    have one. It encrypts no content; it exists only to wrap the keys beneath it.
*   **An edge is a wrapped key.** A branch KEK wraps the data keys of the notes in it; a
    flight KEK wraps its branches' KEKs. A note tagged with two nests has its data key
    wrapped under the branch and under both nests. Wrapping costs one AES-GCM operation
    and about forty bytes per edge, so a dense graph is cheap.
*   **A share is one more wrap.** Sharing object X with user U means wrapping X's key under
    U's public key. U can then unwrap everything reachable below X, and nothing above it.

To read one row a client walks: passphrase → its own private key → the grants it holds →
down the wraps → the row's data key. The walk is done once per session and cached, and
resolved lazily: a workspace with two thousand notes has two thousand data keys, and
opening one note needs one of them.

### Delivering a share

The key graph decides who *can* read a course. The row store has to agree, or a share is a
promise with nothing behind it: the recipient holds a key that opens bytes they are never
sent. So `sync` is scoped by the key that sealed a row rather than by who owns it — a row
goes out when the caller can derive its key, and nowhere else.

Writes follow the same rule, with one extra step. An edit to a shared row lands *on that
row*, found by its key, not as a second row under the editor's own id; two copies of one
note, each device sure it had the only one, is the failure worth designing against.
Existence and freshness are separate questions — a row that exists but loses on `updatedAt`
is still that row's edit — and a caller who may read but not write has the edit dropped,
because the server cannot merge ciphertext and must not fork it.

A grant does not make rows *newer*, so a recipient whose cursor is already past the owner's
writes would step straight over a share. The server does not re-stamp those rows — that
would hand them back to everyone who could already read them. The recipient asks instead:
a sync round that finds grants it has not seen before calls `POST /v1/sync/backfill` with
those keys, and gets every row under them once, on a cursor of its own. The key walk that
decides all of this is one recursive query over `key_wraps` (`server/src/key-graph.ts`),
touching only the part of the graph under the caller's grants.

The client refuses that pen before the server has to. `lib/keys/access.ts` walks the graph
the way the server does — from writer grants, everything beneath is writable — so a note
shared to read opens read-only (TipTap not editable, the canvas without its tools), and every
storage module refuses to change what sits under a reader's key: a note's content, title
and placement; a task (edit, board move, delete); a file; a course's or tag's name and
colour; and filing anything new inside it, which throws `ReadOnlyError` and is reported in
the path bar rather than failing. The snapshot marks those rows `readOnly`, so the settings
editor does not list them and the task form neither offers the course nor opens for its
tasks. Sync never pushes a reader's copy.
A pulled row under a read-only key replaces the local one outright, which also heals a copy
that drifted before this existed. The sharing screen changes a role in place: re-sharing at
the new role is the same `POST /v1/keys/share`, and the server clamps it to the sharer's own.

### Merging two edits of one row

The server orders writes and cannot merge them, so a device that finds two versions merges
on its own (`lib/sync/reconcile.ts`). It keeps the last version of each row the server
handed over — sealed exactly as it arrived, in the `sync-bases` store — as the *base*. When
a pulled row differs from the base and the local row does too, both sides changed, and the
two are merged against the base instead of one replacing the other:

*   **A note's text** is merged by top-level block (a paragraph, a heading, a whole list):
    diff3 over the blocks, with a stretch edited in place resolved block by block, so two
    people editing different — even adjacent — paragraphs both keep their edits. Where both
    changed the same paragraph it is merged again word by word, and kept only if its markup
    is exactly what one side wrote; otherwise the later edit wins that paragraph.
*   **A canvas** is merged by element, using the canvas's per-element `version`: whichever
    side touched a shape wins it, an edit beats a delete, and stacking follows the
    fractional `index`. A page one side deleted while the other wrote on it comes back, so
    the new ink has somewhere to be drawn.
*   **Every other row** is merged field by field, the one sealed display field opened first.

Where both sides changed the *same* words, shape or field, the later edit wins that piece and
nothing else. The merge is sealed under the row's own key (or abandoned, falling back to last
write wins, if this device does not hold it), stamped newer than both sides, and pushed on
the next round, so every device converges on it by the server's ordinary rule. A row with no
base yet — anything last synced before this existed — is last-write-wins until it has one.

### Seeing another person's edit live

A note open on two devices updates without a reload. The server keeps a WebSocket per
signed-in device (`GET /v1/live`, `server/src/live.ts`); after a sync that wrote rows, and
after a share, it nudges every connected account that can read one of the keys touched,
plus the writer's own other devices. A nudge carries no row and no name — only "sync now" —
so the change still arrives sealed, validated and merged through the ordinary sync round,
and a lost nudge costs a minute until the periodic round, never data. The session token is
the socket's first message, not part of the URL, because browsers cannot set a header on a
WebSocket and a token in a URL ends up in logs.

On the device, a round reports which rows it changed (`subscribeToSyncChanges`), and the
notes page reloads the open note when its content changed and nothing typed here is still
waiting to be saved. With unsaved typing it waits: that edit is saved, merged on the next
round, and the merged note arrives as one more change, with nothing pending, and is shown.
The hub is in memory and per process; running more than one server process needs it moved
onto a shared channel (Postgres `LISTEN/NOTIFY`), and nothing else in the protocol changes.

### What each share actually gives away

| Shared | The other person gets | They do not get |
| --- | --- | --- |
| A wing | Everything in it, now and later | Other wings |
| A flight | Its courses, tags, notes, tasks, files | The wing's name, or anything in other flights |
| A branch | That course and everything under it | The flight or wing it sits in |
| A nest | The notes, twigs and pebbles carrying that tag | Anything in the branch that is not tagged |
| One note | That note's title, text, drawing and images, and the names on its path | Anything else in its course or tags, its neighbours |

Every row above the shared thing — "Above it" in the table — is still sealed under a key the
recipient does not hold. What they get instead is its **path**: a `share-paths` row
(`lib/hierarchy/share-path-model.ts`) holding just the names on the way down — wing, term, course and
the note's own tags — sealed under the shared object's *own* key. The row store files it
under that key, so it reaches exactly the people the object does, and a backfill brings it
with everything else. The recipient's path bar shows the shared thing where it really lives;
those rows are marked path-only in the snapshot, never offered for editing, and never chosen
as the home of a new note. Sharing writes the path; each sync round rewrites it if a name on
it changed, but only from a device that can see the whole path and may write the object.
Where there is no path — a share made before paths existed, until its owner opens it on the
sharing screen — a course still falls back to "Shared with you".

### Media, which is shared already

A picture dropped into two notes is one row in `notes-media`, deduplicated by content
hash. Its data key is wrapped under every note that draws it — the same relationship the
reference counting in `notes-delete.ts` and `saveSpatialDocumentPayload` already tracks,
expressed in keys. Share one of those notes and the image comes with it; the other note
stays sealed.

### Revocation, and its limit

Removing someone means two things, and only one of them is easy. The server drops their
grants, so they can no longer download the rows. But they already hold the keys they
unwrapped, and may already hold the ciphertext.

So revocation is a rotation: new key for the object, re-wrapped for everyone still on the
list, and its content re-encrypted. Doing that eagerly for a whole wing is a rewrite of
the workspace. Doing it lazily — rotating an object the first time someone edits it after
the removal — costs nothing until something changes, and is what the app should do.

That is what `lib/keys/rotate-shared.ts` does, on a revoke and on a schedule. Each sync
round, the device that holds every container above a shared key rotates it once it is older
than ninety days by the server's `createdAt`, provided somebody else still holds it: a new
key hung everywhere the old one was, the rows moved onto it and stamped as edits so sync
carries them, and the new key handed to everyone still on the list, who backfill under it.
A device missing any of the containers — a writer given one course — never rotates, since
the new key could not be hung where the owner reaches the old one.

**Say it plainly in the UI:** removing someone stops them seeing what happens next. It
cannot unsee what they already had. Anything else is a promise the maths does not make.

### What this changes about the lock that exists

Today a passphrase derives one key that encrypts everything, so changing it rewrites every
row — the sweep in `workspace-rekey.ts`, with its journal and its resume.

Under envelope encryption the passphrase only ever seals the user's private key. Changing
it re-seals one small blob and touches no content at all: a rekey that was O(rows) becomes
O(1). The sweep does not go away — turning encryption on for the first time still has to
convert plaintext rows, and that is still the path worth being able to resume — but it
stops being something a user waits on for anything else.

Rows also need to record **which key** wrote them, not only which cipher. `encryption` is
enough when there is one key per browser; it is not enough once keys rotate. A `keyId`
column is the smallest change that makes rotation possible, and it is far cheaper to add
before there is a second device than after.

## The server

### Schema

As built, in `server/src/db.ts`:

```sql
users(id, email, auth_hash, kdf, sealed_account_key, public_key, sealed_private_key, …)
sessions(token_hash, user_id, expires_at, created_at)
keys(id, owner_id, kind, rotated_from)    -- kind: wing|flight|branch|nest|feather|twig|pebble
key_wraps(parent_key_id, child_key_id, wrapped)
grants(key_id, user_id, role, wrapped)
rows(user_id, store, id, seq, updated_at, deleted_at, key_id, encryption, payload,
     due_date, due_minutes, time_zone, status)
media(user_id, id, seq, mime_type, created, updated_at, key_id, encryption, bytes)
push_subscriptions(user_id, endpoint, p256dh, auth, reminded_through)
```

`rows.payload` is opaque. The date columns and `status` are the only ones the server reads
for its own purposes, and the reason it can send a reminder at all. `seq` is a
server-assigned monotonic number — the thing a client asks "what is new to me" with,
because client clocks skew and `updated_at` cannot be trusted for ordering across devices.
`updated_at` stays, and is what a write is resolved by: a row lands only if it beats the
one stored.

The wing is not a column. A row belongs to a user and is reachable through a key; which
wing it sits in is inside the payload, where the server cannot read it and does not need to.

### Endpoints

```
POST   /v1/auth/prelogin        address -> KDF parameters (decoy if there is no account)
POST   /v1/auth/register        email + auth key + public key + sealed keys
POST   /v1/auth/session         email + auth key -> session token
DELETE /v1/auth/session         end this session
POST   /v1/auth/passphrase      reseal the account key, drop every other session
DELETE /v1/auth/account         session + auth key -> erase the account and all it owns
GET    /v1/keys                 this account's own sealed key material
POST   /v1/sync                 { since, rows[] } -> { seq, rows[] }
POST   /v1/sync/backfill        { keyIds[], after } -> every row under keys just granted
GET    /v1/live                 WebSocket: a "sync now" nudge when readable rows change
GET    /v1/media                what blobs exist, and their seq
PUT    /v1/media/:id            store one blob (meta in headers, bytes in the body)
GET    /v1/media/:id            fetch one blob
GET    /v1/keys/graph           the keys, wraps and grants this user can walk
POST   /v1/keys                 record keys, wraps and grants made on the device
POST   /v1/keys/share           wrap a key for another user
POST   /v1/keys/revoke          drop a grant
GET    /v1/keys/:keyId/shares   who a key has been given to, by address
GET    /v1/users/public-key     the key to seal a share with
POST   /v1/push/subscribe       a Web Push subscription for this device
DELETE /v1/push/subscribe       forget one
POST   /v1/feeds/relay          { url } -> { text }: fetch a calendar feed a browser may not
```

`/v1/feeds/relay` exists because most calendar hosts (Brightspace, Google, Outlook) send no
CORS headers, so a browser cannot read a feed that anyone with the link may download. A
device tries the feed directly first and asks its server only when the browser refuses. The
server fetches public https addresses only — checked by name and again on the connection's
own lookup, on every redirect (`server/src/feed-relay.ts`) — caps the body at 5 MiB, hands
back only what reads as a calendar, and serves signed-in callers only, twenty a minute. It
logs and stores nothing.

`/v1/sync` is the whole of B2. Apply each incoming row if its `updated_at` beats what is
stored, assign a `seq`, return everything above the caller's cursor. The client already has
the merge rule — `workspace-restore.ts` resolves by `updated_at` with tombstones winning —
and the sync client should call that same code rather than growing a second copy of it.

### One passphrase, split

The account password and the workspace passphrase must not be the same secret sent two
ways, or the server could derive the key it is not supposed to have. They also should not
be two things a user has to remember, because they will reuse one and defeat it.

Derive both from one passphrase: Argon2id as today, then HKDF with two different `info`
strings. The `auth` half goes to the server. The `content` half never leaves the device.

### Stack

Hono and Postgres, deployed on its own. Not Supabase — its value is auth, realtime and RLS,
and here RLS guards blobs that are useless without a key, realtime is a `seq` poll, and
auth is the one part worth having. That trade is a week of writing register, session and
password reset against a dependency that would otherwise shape the whole project.

The server imports the same Zod schemas the client uses, from `shared/`. That is the reason
the server lives in this repository: the schemas **are** the protocol, and two copies of
them drift the first time one gains a field.

## Phases

0.  **Client prerequisites.** Done. Every sealed row carries a `keyId` beside its
    `encryption` marker, and every twig carries `dueMinutes` and an IANA `timeZone`
    beside the free text it was parsed from.

    The time is stored as a wall clock and a zone rather than as an instant, which is a
    change from what this document first said. A date, a wall-clock time and a zone name
    determine an instant, but the conversion needs real timezone data and has no right
    answer for the hour DST repeats or skips. Keeping the wall clock and converting where
    there is a library to do it with is what iCalendar does with `DTSTART` and `TZID`, and
    it is the server that will schedule from it.
1.  **Accounts.** Done. Register, session, the split passphrase, changing it, and recovery
    of the sealed private key on a second device. A sign-in failure and an address with no
    account are the same answer, and `prelogin` returns decoy parameters derived from the
    address and the server secret so that asking about a stranger looks like asking about
    a user.
2.  **Sync.** Done. `POST /v1/sync` for rows, `PUT/GET /v1/media/:id` for the blobs that
    are too big to travel with them. Last write wins, resolved in SQL by `updated_at`, and
    read back by the server's `seq`.
3.  **Push.** Done. `sweepReminders` finds what is due from the clear columns, composes a
    body it cannot make specific — a count and a time — and delivers it over Web Push.
    `zonedInstant` turns a date key, a wall clock and an IANA zone into an instant using
    `Intl` alone, so the server needs no timezone dependency.
4.  **Sharing.** Done, on the server and in `src/lib/keys/`. The key graph, grants,
    revocation, and a walk that derives every key reachable from a grant and nothing else.
    Rotation is recorded (`keys.rotated_from`) and performed by the client, on a revoke and
    once a shared key is ninety days old (see "Revocation, and its limit").
5.  **Paid tiers.** Not started, and needs billing infrastructure this repository has none
    of. Out of scope until the four above are wired into the app.

### Running it

```
DATABASE_URL=postgres://… SERVER_SECRET=… ALLOWED_ORIGINS=https://app.example.com \
  npm run build:server && npm run start:server
```

`server/src/config.ts` refuses to start with a list of everything that is missing rather
than a default for a secret. `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are
all three or none; without them the server runs and sends no reminders, which is a choice
rather than a failure. The client is pointed at it with `VITE_API_URL` at build time.

To run it against a real Postgres without installing one, `docker compose up --build` starts
both (`Dockerfile`, `docker-compose.yml`). Put `POSTGRES_PASSWORD` and `SERVER_SECRET` in a
git-ignored `.env`; compose refuses to start without them, and `SERVER_SECRET` has to be the
same on every start. The server listens on `127.0.0.1:8787` and allows
`http://localhost:5173` and `:5174` (Vite's next port when 5173 is taken) unless
`ALLOWED_ORIGINS` says otherwise. An origin it does not allow is not refused by the server:
the browser blocks the request, and the account form can only say the server would not take
the address. A dev server started as
`VITE_API_URL=http://localhost:8787 npm run dev` talks to it. The image installs the
production dependencies, which are one list for the app and the server, so it is larger
than the bundle alone needs.

To put it on the internet — the image serves the built app too (`STATIC_DIR`), and Compose
has an optional Cloudflare Tunnel — see [`deploy.md`](./deploy.md). Three settings exist for
that case: `CLIENT_IP_HEADER` (where a proxy puts the caller's address, so sign-in guesses are
limited per address as well as per account), `REGISTRATION_EMAILS` (who may create an
account) and `STATIC_DIR`.

The server is bundled with Vite rather than run from source: Node can strip types now but
cannot resolve `./app` or `@shared/…`, which this codebase writes everywhere because the
browser build resolves them.

### Keys, as built

Every object that can be shared on its own gets a key of its own, minted by
`lib/keys/object-keys.ts` when the thing is created and wrapped under every container it
sits in — a note tagged twice is wrapped three times, under its course and under each tag,
because a nest is a tag and either route has to reach it.

The key an object's rows are sealed under is recorded as the cipher marker the row already
carried. There is no second table saying which key belongs to what: the row says it, which
is also what a recipient reads. Reads resolve through the keyring by that marker, so one
list can hold rows on several keys — your own course beside one somebody shared.

**Without an account there are no object keys at all.** A local workspace has one key, or
none, and nothing to hang a graph on; every function there falls back to the active cipher
and the app behaves exactly as it did before. Sharing needs an account, so keys that exist
to make sharing possible need one too.

### What is still missing

*   **Live nudges are per process.** Fine for one server; a second process needs the hub
    on a shared channel before a device connected to one hears a write made through the
    other.
*   **Two people rewriting the same words keep one version.** Word-level merge keeps edits
    to different words of one paragraph; the same words, or formatting changed both ways
    at once, still go to the later edit with no sign the other existed.
*   **A retired key is not revoked.** Scheduled rotation hands everyone the new key and
    moves every row onto it, so the old key opens nothing written after — but the grants on
    the old key are left in place rather than cleaned up.
*   **Paid tiers.** Not started, and needs billing infrastructure this repository has none
    of.

## What it costs, stated plainly

*   **A push notification cannot say what is due.** The server composes the message and
    cannot read the title. The service worker cannot fill it in either — it has no access
    to the page's key, and none at all while the workspace is locked. So: "something is due
    at nine", and the title when the app is opened.
*   **The server sees the shape.** Zero-knowledge about content is not zero-knowledge about
    structure. How many notes a course has, who shares what with whom, and when things are
    due are all visible. Say "the server cannot read your notes", never "the server knows
    nothing".
*   **A relayed calendar is seen in passing.** A feed's link is a password to that
    calendar, and a feed fetched through the relay passes through the server in the clear.
    Nothing keeps it, but a server someone else runs could. A feed its host lets browsers
    read never goes near the server; the feed's settings, link included, live sealed on the
    device and are not synced.
*   **A three-way merge is not live co-editing.** Edits to different words, shapes or
    fields survive, and the other person sees them within a sync round of the nudge; two
    people typing the same words at once do not both survive, and nobody sees the other's
    cursor. That needs a CRDT (Yjs or Automerge) and a different sync path — a new
    dependency and a new document format — and should not be started until somebody
    actually wants it.

## Deliberately not doing

*   **Mirroring the hierarchy in Postgres.** The server cannot read names. Tables for
    wings and branches would carry no information and one more thing to keep in step.
*   **A data-fetching library.** `CLAUDE.md` §2.3 requires approval, and a sync cursor is
    not what TanStack Query is for.
*   **Zustand for core data.** The old plan proposed it; the app stores data in IndexedDB and
    derives state from it, and §2.4 says to keep global state minimal. Zustand is in the app
    now, but only for UI state shared across unrelated trees (the appearance preferences and
    the command palette), never for rows.
*   **`vite-plugin-pwa`.** §5 forbids replacing the hand-written service worker without a
    reason, and this is not one.
