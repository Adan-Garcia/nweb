# What the site promises that the app does not do yet

Rewritten 2026-09-21. This file lists only what is **still missing**. Everything that has
shipped has been deleted from it rather than ticked off — the git log is the record of what
was done, and a gap list that is mostly closed items stops being read.

Every row was checked against the code, not against the README.

## Where the app is now

A front-end-only app, and an honest one. Notes, tasks, files and the whole Wing → Flight →
Branch → Nest → Feather hierarchy are real records in IndexedDB. There is a calendar, a
board, a dashboard and in-app notifications. It installs as a PWA and starts offline. Notes
are Brotli-compressed, and can be encrypted behind a passphrase. Backups export and import,
optionally encrypted.

There is still **no server**, so there is no account, no sync, no sharing and nothing to
pay for. The site says so.

---

# Part A. Still missing, and buildable with no backend

## A1. Encryption: the half that is not covered

The workspace lock encrypts note content — the text, the drawings, and the bytes of every
image and PDF. It does **not** encrypt the rows the app lists and sorts by.

| Gap | Where | Why it is not done |
| --- | --- | --- |
| Note titles, course names, task titles and due dates are readable with the workspace locked | `notes-directory`, `twigs`, `wings`/`flights`/`branches`/`nests` | These are read with `getAll()` and filtered in JS, so encrypting them is possible without indexes — but every list, sort and lookup would have to decrypt first. It is a change to how the app reads, not to how one payload is written. The settings card and the privacy page both say so today. |
| Media blobs are re-encrypted one row at a time | `workspace-rekey.ts` | Setting a passphrase on a large workspace rewrites every image serially, with no progress and no resume. A failure partway leaves some rows converted; the caller ordering means the recoverable state is the readable one, but a user with a gigabyte of PDFs will sit on a spinner. |
| PBKDF2, not Argon2id | `crypto-envelope.ts` | PBKDF2-SHA256 at 600,000 iterations is WebCrypto's best native option. Argon2id would be meaningfully stronger against GPU attack and needs a WASM dependency. The KDF name is recorded in every envelope and in the lock record, so adding it later is a new value, not a migration. |
| No "change passphrase" | — | You can set one and remove one. Changing it means remove then set, which decrypts everything and re-encrypts it. A direct rekey would be one pass instead of two. |

## A2. Entities: storage without UI

`entity-storage.ts` and `entity-delete.ts` expose rename, recolour and cascading delete for
wings, flights, branches and nests, all covered by tests. **Nothing on screen calls them.**
The notes path bar can only add. A workspace editor — most naturally on the settings page —
is what turns that storage into a feature.

## A3. `NotesFileViewer` still has no render path

`NotesFileViewer`, `NotesTreeView`, `NotesNoteButton`, `NotesTreeGroup` and `notes-tree.ts`
render nothing: no page has mounted them since `d03aa1a`. They were migrated to the entity
model rather than left broken, and their tests pass, but they reach no user. Decide: wire
the sidebar up, or delete them.

## A4. Smaller things

| Gap | Where | Note |
| --- | --- | --- |
| `saveSpatialDocumentPayload` deletes shared media by id | `notes-document-storage.ts` | `softDeleteNote`, `softDeletePebble` and the entity cascade all count references before dropping a blob. The save path does not: when a file leaves one scene it goes even if another note draws it. Same fix, same helper, not yet applied there. |
| Tombstones are never collected | everywhere | Deletes drop the bytes, so a tombstone is a few bytes, but nothing ever removes the marker rows — for notes, and now for every entity, twig and pebble. They accumulate for the life of the database. |
| A route never visited is not cached | `public/sw.js` | The service worker caches what it serves and does not control the page that registered it, so opening a route for the first time while offline still fails. From the second visit on, everything touched works. |
| Feathers are called markdown | `documentation-content.ts:27` | They are TipTap HTML plus an Excalidraw scene. `Heirarchy.md` says JSON. Neither is markdown. Fix the doc or add a markdown export. |
| No "About" page | `marketing-nav.ts` | The nav has no About link now, which is honest. If one is wanted, it has to be written. |
| Zustand is installed and unused | `package.json` | Kept on purpose for cross-tree state. Nothing needs it yet. |
| No CI | — | Nothing runs `format:check`, `typecheck`, `lint`, `test:coverage`, `build` or `test:e2e` automatically. `playwright.config.ts` is already CI-aware. This is the highest-value item in this file. |

---

# Part B. Needs a backend

None of these can be true without a server, because each one involves identity, a second
device, a second person, or money. In dependency order; each depends on the one before.
`CLAUDE.md` section 2.3 says how: a dedicated `src/lib/api/` service module, Zod-validated
responses, and approval before adding a data-fetching library.

## B1. Accounts and identity

| Feature | Claimed at | Status |
| --- | --- | --- |
| Create an account / sign in | `signup.tsx`, `signin.tsx`, `unlogged.tsx`, `onboarding-steps.ts` | **Absent.** The forms validate, then do nothing. No session, no user, no route guard. |
| Forgot password | `login-form.tsx` | **Absent.** Needs a server to send email. |
| Log out | — | Meaningless until there is a session. |

The forms, validation and routes are in place, so this is wiring plus a service.

**Note:** the workspace lock is *not* an account and must not be presented as one. It is a
passphrase on this browser, with no recovery.

## B2. Sync

| Feature | Claimed at | Status |
| --- | --- | --- |
| Fast syncing across all devices | `landing-benefits.tsx` (marked Coming soon) | **Absent.** |
| "Your data will sync once you're back online" | `landing-benefits.tsx` | **Absent.** |
| Real-time sync, Supabase, optimistic concurrency | `documentation-content.ts`, `Todo.md` section 2 | **Absent.** |
| Encrypted sync (zero-knowledge envelope) | `Todo.md` section 3 | The cipher half exists. The server storing only ciphertext is this. |

**The prerequisite is already met:** every record now has a UUID, `updatedAt` and a
`deletedAt` tombstone, which is what makes a merge and a delete safe. That was the point of
doing the entity work first.

**No-server stopgap:** the export/import file moves data between devices by hand. It is a
backup, not sync, and the site should not call it sync.

## B3. Sharing and collaboration

| Feature | Claimed at | Status |
| --- | --- | --- |
| Share notes and homework | `landing-benefits.tsx` (Coming soon), `unlogged.tsx` | **Absent.** |
| Invite Your Flock: members, permissions, real-time collaboration | `onboarding-steps.ts` | **Absent.** The step is text only. |
| A user belongs to many wings but owns exactly one | `Heirarchy.md`, `documentation-content.ts` | **Half.** Several local wings work. Membership and ownership need users. |
| Key exchange, RLS, revocation, key rotation | `documentation-content.ts`, `Todo.md` section 4 | **Absent.** Needs a server to hold public keys and enforce access. |

## B4. Paid tiers

Labelled "Coming Soon" throughout, so honest. Supporter-only faster servers, higher storage
limits, private team servers, frequent cloud backups. No servers exist, and they also need
billing and support tooling, which is outside the app.

---

# Part C. Split: the front-end half is done, the rest needs a server

| Feature | Done, no backend | Still needs the backend |
| --- | --- | --- |
| **Encryption** | Passphrase-derived AES-GCM on note content, plus the app lock and encrypted backups. | Keypairs, envelope keys, key exchange, revocation, and storing only ciphertext on a server (B2, B3). |
| **Wings** | Several local wings as real records. | Membership and ownership across users (B3). |
| **Sharing** | Export/import a file to send someone a copy. | Live shared workspaces, permissions, real-time edits (B3). |
| **Notifications** | The in-app bell: overdue, due today, due this week. | Push and email when the app is closed. |
| **Onboarding steps** | "Create your first wing" could create a local wing. | Invites (B3). |
| **Settings** | Theme, backup, workspace lock. | Account, email, billing, devices (B1). |
| **Backups** | Manual export, optionally encrypted. | Automatic cloud backups, a paid-tier feature (B4). |

---

# Part D. Order of work

1. **CI.** Everything below is safer with the gates running automatically. Nothing else in
   this file is cheaper.
2. **A2, the workspace editor** — rename and delete already work in storage and are
   invisible. The largest gap between what the code does and what a user can reach.
3. **A3** — wire the file viewer up or delete it. It has been dead since `d03aa1a`.
4. **A1** — encrypt the titles, if the lock is meant to mean what most people will read it
   to mean. Decide this before anyone relies on it.
5. **A4** — the shared-media save path, then tombstone collection.
6. **Then the backend, as one project:** accounts (B1), sync (B2), encrypted sync,
   sharing (B3), paid tiers (B4).
