# Features promised by the site vs. what the app does

Audit date: 2026-09-20. Sources: every public page (landing, pricing, privacy, documentation,
sign-in, sign-up, `/auth`, onboarding), `Heirarchy.md`, `Todo.md`, `notes.md`. Each row was checked
against the code, not against the README.

**What actually exists:** a front-end-only app. No backend, no accounts, no network calls of its own
(the only `fetch` is `scene-utils.ts:46`, turning a `data:` URL into a Blob). Notes live in IndexedDB,
calendar events in `localStorage`. The sign-in and sign-up forms validate input and do nothing else
(`login-form.tsx:62`, `signup-form.tsx:52`). The README already says this; the site does not.

Legend: **Absent** = nothing in the code. **Partial** = some of it works.

## Progress

Approved on 2026-09-20 and shipped so far:

| Item | State | Commit |
| --- | --- | --- |
| A0 copy fixes | **Done.** All nine false statements rewritten, plus a tenth in the landing hero. Tests assert the AES-GCM, key-exchange and encryption-first wording stays gone. | `f758471` |
| A6 LICENSE and repo link | **Done.** MIT, declared in `package.json`, linked from a new site footer. | `cf6c593` |
| A1 dead controls | **Done.** Inert buttons and `href="#"` links removed or pointed somewhere real. | `37b9af4` |
| A4 export/import | **Done.** Dated JSON backup of notes, media and calendar, restored through a Zod-validated schema, driven from a new settings page. | `7902ae4` |
| A2 data model, step 1: stable note ids | **Done.** Notes carry a UUID instead of an id built from their path, so a course can be renamed. Adds a `deletedAt` tombstone. `NOTES_DB_VERSION` 2 to 3, rewriting no rows. | `7fd9346` |
| A2 data model, step 2: delete a note | **Done.** Deletes the note that is open, behind a confirmation, from the notes path bar. Tombstones the entry and drops the document and its media. | this commit |
| A2 data model, the rest | **Done.** Wings, flights, branches and nests are records with UUIDs, timestamps and tombstones, and rename/recolour/cascading-delete storage. Notes point at a branch and carry nests as tags. Twigs replaced calendar events and moved into IndexedDB. Pebbles list files as their own entity. `NOTES_DB_VERSION` 3 to 4, converting every string path and every stored event in one transaction; backup format 1 to 2, still restoring a version 1 file. | this commit |
| Notifications (in-app) | **Done.** A bell in the sidebar lists what is overdue, due today and due in the next week, computed from the twigs, with a count badge for the first two. Push and email still need a server (Part C). | this commit |
| A5 drag and drop, kanban | **Done.** A board at `/board` with a column per status; cards drag between and within columns, by pointer or by keyboard. On the calendar, a task drags onto another day to reschedule it. `@dnd-kit` is finally doing the job it was installed for. | this commit |
| A3 PWA | **Done.** A manifest with real icons, and a hand-written service worker, so the app installs and starts with no network. No new dependency. | this commit |
| Crypto seam, then the app lock | Separate version bump, last of the storage work. Confirmed: on by default, no reset. | |
| WASM Brotli | **Done.** `brotli-wasm`, loaded lazily in the worker. Notes are 38-50% smaller than gzip on the payloads actually stored. | this commit |
| Crypto seam, then the app lock | Next. | |

Decisions taken while building the above, all worth knowing:

- **The copy runs in two passes.** Everything encryption-related now reads "Coming soon", because
  the lock does not exist yet. When it ships, only the narrow wording comes back: "encrypted on this
  device when locked", never "Device Level Encryption".
- **The encrypted export waits for the cipher.** The backup is plaintext today. The
  plaintext-or-encrypted choice at export time arrives with the crypto seam, since it needs the
  same code.
- **Backups carry tombstones.** Deleted notes travel in the export file as markers with no content.
  Dropping them would mean a restore could not tell a note that was deleted from one that never
  existed, so under any future merge-style restore every deletion since the backup would come back.
- **Twigs replaced calendar events rather than sitting beside them.** A homework with a due date and
  a calendar event were the same record wearing two names, and a board that dragged one of them
  would have left the other behind. The calendar now draws the twigs that have a due date; an
  undated twig is still a task, just not a deadline. The old `localStorage` key is deliberately left
  in place so a failed upgrade can be retried.
- **A nest became a real tag, but still navigates like a path segment.** `Heirarchy.md` always called
  it a tag; it was the fourth string in a note's path. It is now a record on a branch that notes,
  twigs and pebbles carry a list of, and the path bar keeps a Nest dropdown, so a note filed under
  two units is reachable under both. Notes carrying none are grouped under "Unfiled".
- **Shared images survive a delete.** Deleting a note, a pebble or a whole branch now counts
  references across `notes-documents` and `pebbles` before dropping a blob, which closes the gap
  logged in `CLAUDE.md` section 13. The save path still has it (see that section).

Two things found while building the delete, both logged in CLAUDE.md section 13 rather than fixed
here:

- **A second file viewer exists and nothing renders it.** `NotesFileViewer` and the five modules
  under it are around 400 lines with their own tests, and have had no render path since they were
  written. The delete went into the path bar instead, which is the only notes chrome the page
  actually shows. This is the same class of problem as A1, found in components rather than controls.
- **Shared images are deleted with the note that referenced them.** Excalidraw derives an image's id
  from its contents, so the same picture dropped into two notes is one stored row. Deleting either
  note removes it. The save path has had this gap since it was written; closing it needs a reference
  count across documents.

## How this file is organised

Every gap is sorted by one question: **can it be built and shipped with the code in this repo alone,
or does it need a server?**

| Part | Meaning |
| --- | --- |
| **A. No backend needed** | Buildable now, browser only: copy fixes, dead controls, data model, PWA, export, local encryption, kanban, LICENSE. |
| **B. Needs a backend** | Cannot be true without a server: accounts, sync, sharing, paid tiers. One project, in dependency order. |
| **C. Split** | A useful front-end half exists now; the rest needs the server. |
| **D. Partial claims** | Claimed and half true, each tagged A or B. |
| **E. Built but unadvertised** | Exists, not on the site. |
| **F. Suggested order** | |

The big picture: **most of what a student would use day to day (Twigs, courses, kanban, install,
offline, backup, a lock) needs no server.** What needs one is everything involving a second device
or a second person, and the paid tiers.

---

# Part A. Requires no backend

## A0. Fix first: statements that are false today

Nine statements are worded as fact, not as plans. **All of them are fixed by editing copy alone**,
so this is the cheapest and most important item in the file. The privacy page is the most serious,
because it describes security properties the app does not have. Nothing is encrypted anywhere: there
is no `crypto.subtle`, no key, no cipher in `src/`.

| # | Where | What it says | Reality |
| --- | --- | --- | --- |
| 1 | `privacy-content.ts:23-26` | Data is encrypted before it leaves the device; unique AES-GCM keys per course and note; private keys stay on device; "100% open-source ... can be independently verified" | No encryption code exists. No LICENSE file, `package.json` is `"private": true`, and the app never links to the repo. The claim cannot be verified by anyone reading the site. |
| 2 | `privacy-content.ts:33-35` | Shared workspaces use key exchange; row-level policies; revocation and key rotation | No sharing, no server, no keys, no RLS. |
| 3 | `privacy-content.ts:14,16,43` | Collects "email and profile details", "operational logs", syncs encrypted copies to the cloud | Nothing is collected or sent. Also a dated policy (`privacy.tsx:22`, "Last updated: April 15, 2026") that describes a service that does not run. |
| 4 | `privacy-content.ts:59-69` | "Before your notes leave your device, they are scrambled" / "only your key can unlock it" | No scrambling, no key. Notes are compressed (gzip) but not encrypted; the calendar is plain JSON in `localStorage`. |
| 5 | `landing-benefits.tsx:34-35` | "Device Level Encryption: Your data is encrypted at the device level" | Not encrypted. IndexedDB and `localStorage` are plain. (Can be made true without a server, see A4.) |
| 6 | `signin.tsx:12` | "resume your encrypted workspace, keep your drafts in sync ... on every device" | No encryption, no sync, no session to resume. |
| 7 | `signin.tsx:17` / `landing-benefits.tsx:14-15` | "Your workspace stays locked to your account" | No account exists. Anyone on the browser profile can open everything. |
| 8 | `unlogged.tsx:42-43` | "keep your information encrypted and safe" | Same as #5. The second half ("stored locally ... never leaves it") is true, but it contradicts the privacy page, which says encrypted copies sync to the cloud. |
| 9 | `pricing.tsx:40` | "Every plan follows the same encryption-first model: ... secure key management, and access control" | No encryption, no keys, no access control. |

**Recommendation:** rewrite these to describe the app as it is, and move the rest to a clearly
labelled roadmap. For the privacy policy in particular, this is worth doing before anyone but you
uses the app: a policy that says data is encrypted when it is not is a liability, not a placeholder.

- Privacy page: replace the four sections with what is true ("Everything you create stays in your
  browser. Nothing is sent to a server. Nothing is encrypted at rest, so anyone with access to this
  browser profile can read it."), and drop the "Last updated" date until there is something to date.
- Sign-in / sign-up / `/auth`: remove "encrypted", "in sync", "locked to your account".
- Landing: change "Device Level Encryption", "Fast syncing", "Cross platform", "Offline first" and
  "Easy sharing" to "Coming soon" or remove them (Parts A3, A4 and B).
- Keep `documentation-content.ts:36-66` as is: it is already headed as a roadmap
  ("Prioritized from your current Todo roadmap", `documentation.tsx`).

Pricing paid tiers stay "Coming Soon" as requested (`pricing-tiers.ts:35,47`).

## A1. Dead controls and links

| Item | Where | Status | Backend? |
| --- | --- | --- | --- |
| "View our guides" | `onboarding.tsx:54` | `href="#"`. There are no guides; `/documentation` is the roadmap, not a guide. | No. Write a page or remove the link. |
| "About" | `marketing-nav.ts:16` (landing) and `:8` (others) | Landing: `href="#"`. Other pages: points at `/`. No About page. | No. |
| Brand mark link | `landing-header.tsx:54`, `onboarding.tsx:19` | `href="#"`. | No. Point it at `/`. |
| Notifications (bell) | `workspace-sidebar.tsx:84-86` | Button has no handler, no notification model. | Half. An in-app list of due and overdue items needs no server; push and email do (C). |
| Settings button | `workspace-sidebar.tsx:87-89` | Button has no handler, no settings page. | No. A local settings page (theme, data export, clear data) needs no server. |
| Onboarding route | `/auth/onboarding` | Reachable only by typing the URL; nothing links to it. Its steps do not create or invite anything. | No for the page; see C for the steps. |

The other dead controls (log out, forgot password) depend on accounts and are in B1. Until then,
hide them.

## A2. Data model

This is the largest no-backend item and it unlocks most of the dashboard.

| Feature | Claimed at | Status |
| --- | --- | --- |
| **Twigs** (tasks: homework, exams, essays) | `Heirarchy.md:17`, `documentation-content.ts:26-27` | **Absent.** Calendar events have a title/date/time/status but are not linked to a course or a note. No task entity. |
| **Pebbles** (files as their own entity) | `Heirarchy.md:19`, `notes.md:29-31` | **Absent** as an entity. PDF import and image paste/drop work on the canvas (images optimised to WebP), but files are embedded in a note, not stored or listed as files. |
| **Nest as a tag** applied to notes and homework | `Heirarchy.md:14-15`, `documentation-content.ts:22-23` | **Absent as a tag.** Nest is one path segment of a note's location (`location-hierarchy.ts:11`), not something you can attach to several items or to a task. |
| Branch "keeps class notes, tasks, and labels together" | `documentation-content.ts:18-19` | **Partial.** Notes only. Calendar events use a hard-coded subject list (`calendar-event.ts:3-9`: Math, History, Physics, GroupWork, Chemistry), not your branches. |
| Wing / Flight / Branch as real entities | `Heirarchy.md`, `documentation-content.ts:8-27` | **Partial.** They are strings on a note, so you cannot rename, reorder or delete a Wing or Branch, or list "all my courses". |
| Flights sorted into Summer / Fall / Spring + year | `Heirarchy.md:9`, `documentation-content.ts:14-15` | **Partial.** A new note defaults to the current term (`constants.ts:19-27`); after that it is free text and nothing groups or sorts by term. |
| Feathers are **markdown** notes | `documentation-content.ts:27` | **False as worded.** Linear notes are stored as HTML from TipTap (`linear-notes-editor.tsx:38`); `Heirarchy.md` says JSON. Neither is markdown. Fix the doc or add a markdown export. |
| Integrated note editor with tasks embedded in rich text | `Todo.md` section 1 | **Absent.** No task embedding or tagging in the editor. |
| Calendar and dashboard linked to notes and courses | `Todo.md:12-14` | **Partial.** Both work and share data, but events are not linked to notes or courses. |

**Two facts about the current storage that decide how this is built** (both found in the code, not
in any doc):

1. **A note's id is its path, and there is no rename or move.** `buildNotesDocumentId`
   (`constants.ts:46`) joins the slugified wing, flight, branch, nest and feather into the id.
   `slugifySegment` (`constants.ts:37`) lowercases and turns every run of non-alphanumerics into `-`,
   so "Math 101" and "math-101" are the same segment, and because the segments are also joined with
   `-`, nest `unit-1` + feather `notes` collides with nest `unit` + feather `1-notes`. Choosing a
   different location in `createOrOpenDocumentAtLocation` (`use-notes-workspace.ts:145`) opens or
   creates a different note; the old one is left behind. So a Wing or Branch cannot be renamed
   today, and making them real entities needs a `NOTES_DB_VERSION` bump (currently 2,
   `notes-db.ts:6`) and a migration that gives every existing note a stable id first (CLAUDE.md
   section 2.3).
2. **Calendar events have no timestamps and sequential ids.** New ids are `max(id) + 1`
   (`calendar-views.ts:141`), the id is `z.number()` (`calendar-event.ts:14`), and there is no
   `createdAt` / `updatedAt`. Two devices would issue the same id for different events.

Neither blocks doing this now, but if a backend is ever planned, **do the entity work with UUID ids,
`updatedAt` and a `deletedAt` tombstone from the start.** Retrofitting them after users have data is
a second migration, and sync (B2) cannot merge or delete safely without them. Notes already have
`updatedAt` (`notes-model.ts:17`); nothing has a tombstone.

## A3. Offline and install

| Feature | Claimed at | Status |
| --- | --- | --- |
| PWA: manifest, offline asset caching | `Todo.md` section 5 | **Done.** `public/manifest.webmanifest` plus 192/512/maskable icons, and `public/sw.js`. Installable, and a cold start with no network works for everything already visited. Written by hand rather than with `vite-plugin-pwa`, so it adds no dependency and no build step. |
| Offline first | `landing-benefits.tsx:49-50` | **Partial, and now mostly true.** The app installs, and starts and runs with no network. The "will sync once you're back online" half still needs B2. |
| Tauri desktop wrapper | `Todo.md` section 5 | **Absent.** Needs the Rust toolchain; no server. |
| Cross platform (opens on any device) | `landing-benefits.tsx:44-45`, `pricing-tiers.ts:19` | **Partial.** The web app opens in any browser, and a PWA would make it installable on phone and desktop. "Seamlessly, on all your devices" means sync and is B2. |

A PWA makes "offline first" and "installable on every platform" true with no server. It does not make
your data follow you between devices.

**Shipped, with one limit worth knowing:** the service worker caches what it serves, and it is not
controlling the page that registered it, so a route whose chunk has never been fetched under the
worker is not cached and opening it for the first time while offline still fails. From the second
visit on, everything the user touches works offline.

## A4. Data safety

| Feature | Claimed at | Status |
| --- | --- | --- |
| Export / import your data (JSON, plus files) | Implied by "local-first, you own your data" (`signup.tsx:12,17`, `unlogged.tsx:43`) | **Absent.** Clearing site data deletes everything, and there is no backup. This is the single most important missing safety feature. |
| Device-level encryption at rest | `landing-benefits.tsx:34`, `Todo.md` section 3 | **Absent, and buildable without a server.** Encrypt IndexedDB and `localStorage` contents with WebCrypto AES-GCM under a key derived from a passphrase (PBKDF2 or Argon2). The trade-off is that a forgotten passphrase means unrecoverable data, with no account to reset it. |
| An app lock ("locked" workspace) | `signin.tsx:17`, `landing-benefits.tsx:14-15` | **Absent, and buildable without a server** as the unlock step of the passphrase above. It is a local lock, not an account. |
| Brotli text compression | `notes.md:21-22` | **Done.** `brotli-wasm` in the worker, behind a lazy import so the WASM is only fetched on the first save. Measured against the payloads actually stored, Brotli is 38% smaller than gzip on TipTap HTML and 50% smaller on an Excalidraw scene. The algorithm is recorded per row, so notes written as gzip still open. |

Local encryption is the only place the site's "encrypted" wording can honestly be made true without a
backend, but the honest wording is **narrower than "Device Level Encryption."** In a browser app the
key sits in JS memory while the app is unlocked, and the code that uses it is served from the same
origin. So it protects a copied or stolen profile directory or a shared machine while locked. It does
not protect against a compromised bundle or an XSS bug, and there is no server involved either way.
Write it as "your notes are encrypted on this device when the app is locked", and keep the
zero-knowledge and key-exchange wording (B2, B3) out of the copy until a server exists.

## A5. Interaction

| Feature | Claimed at | Status |
| --- | --- | --- |
| Drag and drop calendar and kanban (`@dnd-kit`) | `documentation-content.ts:44`, `Todo.md:13` | **Done.** The board drags cards between and within status columns; the calendar drags a task onto another day. Both by pointer and by keyboard. |
| Zustand stores (`usePlannerStore`, `useEventStore`) | `documentation-content.ts:42`, `Todo.md:6-7` | **Absent.** `zustand` is in `package.json:47` but imported nowhere (CLAUDE.md keeps it on purpose). |
| Typed `DecryptedTask` / `DecryptedNote` / `EncryptedPayload` | `documentation-content.ts:43` | **Absent.** Exist only if A4 encryption is built. |

## A6. Housekeeping that makes claims checkable

| Claim | Where | What works | What does not |
| --- | --- | --- | --- |
| Open Source, forever / on GitHub | `landing-benefits.tsx:24-25`, `pricing.tsx:22,48`, `pricing-tiers.ts:21`, `signup.tsx:12` | A GitHub remote exists (`Adan-Garcia/nweb`). | No link to it anywhere on the site, no LICENSE file (without one the code is legally all-rights-reserved), `"private": true` in `package.json`. Add a LICENSE and a repo link. |
| Free beta through 2027 | `landing-benefits.tsx:30`, `pricing-tiers.ts:11`, `signup.tsx:22` | True by default. | A date commitment; make sure you want to keep it. |
| Local-first, data stored on your device | `signup.tsx:12,17`, `unlogged.tsx:43` | **True.** IndexedDB (notes) + `localStorage` (calendar). | See A4 for the missing backup. |
| Private by default | `landing-benefits.tsx:14-15`, `pricing-tiers.ts:16` | Nothing leaves the browser. | Not "locked to your account" (A0 #7). |
| shadcn/ui, Zod + React Hook Form | `Todo.md:9-11` | Done. | (Not a gap; listed so the checklist can be ticked.) |

---

# Part B. Requires a backend

None of these can be true without a server, because each one involves either identity, a second
device, a second person, or money. Build them in this order; each depends on the one before.
`CLAUDE.md` section 2.3 already says how: a dedicated `src/lib/api/` service module, Zod-validated
responses, and approval before adding a data-fetching library.

## B1. Accounts and identity

| Feature | Claimed at | Status |
| --- | --- | --- |
| Create an account / sign in | `signup.tsx`, `signin.tsx`, `unlogged.tsx`, `onboarding-steps.ts:14-17` ("You've successfully created your account") | **Absent.** Forms validate, then do nothing. There is no session, no user object, no route guard. |
| Forgot password | `login-form.tsx:83` | **Absent.** `href="#"`. Needs a server to send email. |
| Log out | `workspace-sidebar.tsx:90-92` | **Absent.** Button has no handler. Meaningless until there is a session. |
| Privacy page: collects "email and profile details", "operational logs" | `privacy-content.ts:14,16` | Only becomes true once B1 exists, and then needs a real policy. |

The forms, validation and routes are already in place, so this is wiring plus a service.

## B2. Sync

| Feature | Claimed at | Status |
| --- | --- | --- |
| Fast syncing across all devices | `landing-benefits.tsx:19-20` | **Absent.** No sync layer of any kind. |
| Cross-device data ("on all your devices, seamlessly") | `landing-benefits.tsx:44-45`, `pricing-tiers.ts:19` | **Absent.** Each browser has its own separate data. |
| "Your data will sync once you're back online" | `landing-benefits.tsx:49-50` | **Absent.** |
| Real-time sync, Supabase, optimistic concurrency, field-level merge | `documentation-content.ts:48-53`, `Todo.md` section 2 | **Absent.** No Supabase dependency, no `SyncService`. |
| Encrypted sync (zero-knowledge envelope encryption) | `Todo.md` section 3, `documentation-content.ts:60` | **Absent.** The cipher half is A4; the server storing only ciphertext is B2. |

**Prerequisite from A2:** UUID ids, `updatedAt` on every record, and `deletedAt` tombstones. Today
note ids are paths and calendar ids are `max + 1`, so two devices would collide.

**No-server stopgap:** the export/import file in A4 moves data between devices by hand. It is a
backup, not sync, and the site should not describe it as sync.

## B3. Sharing and collaboration

| Feature | Claimed at | Status |
| --- | --- | --- |
| Share notes and homework with friends, family, classmates | `landing-benefits.tsx:39-40`, `unlogged.tsx:39` ("Planning, Notes, and Sharing") | **Absent.** |
| Invite Your Flock: members, permissions, real-time collaboration | `onboarding-steps.ts:29-33` | **Absent.** The step is text only. |
| A user belongs to many wings but owns exactly one | `Heirarchy.md:6`, `documentation-content.ts:11` | **Absent.** Membership and ownership need users. (Several wings for one person is A/C, below.) |
| Key exchange, RLS, revocation and key rotation | `documentation-content.ts:61-62`, `Todo.md` section 4 | **Absent.** Needs a server to hold public keys and enforce access. |
| Shared workspaces on the privacy page | `privacy-content.ts:33-35` | Only becomes true with all of the above. |

## B4. Paid tiers (labelled "Coming Soon", so honest; listed for completeness)

Supporter-only faster servers, higher storage limits, faster support (`pricing-tiers.ts:31-33`);
private team servers, frequent cloud backups (`pricing-tiers.ts:43-45`). No servers exist, so none of
these can be delivered yet. They also need billing and support tooling, which is outside the app.

---

# Part C. Split: front-end half now, backend half later

| Feature | Do now, no backend | Needs the backend |
| --- | --- | --- |
| **Encryption** | Passphrase-derived AES-GCM for local data, plus an app lock (A4). Makes "Device Level Encryption" true. | Keypairs, envelope keys, key exchange, revocation, and storing only ciphertext on the server (B2, B3). |
| **Wings** | Several local wings (profiles) on one browser, as real entities (A2). | "A user belongs to many wings but owns exactly one": membership and ownership (B3). |
| **Sharing** | Export/import a file or a link to send someone a copy (A4). It is a copy, not shared access. | Live shared workspaces, permissions, real-time edits (B3). |
| **Notifications (bell)** | An in-app list of items due today and overdue, computed from the calendar and Twigs. Optionally the browser Notification API while the app is open. | Push and email reminders when the app is closed. |
| **Twigs, kanban, drag and drop** | The whole feature, stored locally (A2, A5). | Only sync of it (B2). |
| **Onboarding steps** | "Create your first wing" can really create a local wing. "Invite your flock" cannot. | Invites (B3). |
| **Settings** | Theme, export, delete-all-data, lock passphrase (A1). | Account, email, billing, devices (B1). |
| **Backups** | Manual export file (A4). | Automatic cloud backups, a paid-tier feature (B4). |

---

# Part D. Partial claims: index

The detail lives in the part named in the last column; this table only says which side each claim is on.

| Claim | Side | Detail in |
| --- | --- | --- |
| Local-first | A | A6, backup in A4 |
| Offline first | A + B | A3 (service worker), B2 (sync) |
| Private by default | A | A6, A0 #7 |
| Open Source | A | A6 |
| Free beta through 2027 | A | A6 |
| Notes organised by Wing > Flight > Branch > Nest > Feather | A | A2 |
| Flights sorted by term | A | A2 |
| Brotli compression | A | A4 — done |
| Files (PDFs, images) | A | A2 (Pebbles) |
| Calendar and dashboard as part of the planner | A | A2 |
| Cross platform | A + B | A3 (installable — done), B2 (data follows you) |

---

# Part E. Implemented but not mentioned on the site

Worth advertising, since the site currently sells things you do not have and hides things you do.
None of these need a backend.

- **Hybrid notes:** a linear TipTap editor and an infinite Excalidraw canvas per note (`notes.md`
  section 1; done, and covered by the E2E suite).
- **PDF import to the canvas** with pen ink that persists across reload (`pdf-import.spec.ts`).
- **Image paste/drop** with WebP optimisation off the main thread.
- **Autosave** with a "saved at" indicator and flush-on-switch.
- **Fullscreen** canvas.
- **Calendar** with add/edit/delete/complete, filters and month/week views, and a **dashboard** with Next
  Priority, Due Today, Upcoming, Overdue, Notes Updated and Recent Notes.
- **Light/dark theme.**

---

# Part F. Suggested order of work

**Phase 1: no backend, do now.** Each step stands alone and ships value.

1. **Copy fixes (A0).** No new features, removes the false statements. Small.
2. **Dead controls (A1) and LICENSE + repo link (A6).** Hide or build; make "Open Source" checkable.
3. **JSON export/import (A4).** So "local-first" has a backup story. Do this before anything that
   changes the stored shapes.
4. **Data model (A2):** UUID ids, `updatedAt` and `deletedAt` on every record, Wing/Flight/Branch as
   entities, Twigs linked to a Branch, calendar events referencing a Branch instead of the five
   hard-coded subjects. Needs a `NOTES_DB_VERSION` bump and a migration, and the export from step 3
   is the safety net for it.
5. **Kanban and drag and drop (A5)**, once Twigs exist. This is what `@dnd-kit` was kept for.
6. **PWA (A3):** manifest + service worker, so "offline first" and "installable" are true.
7. **Local encryption and app lock (A4)**, if you want "Device Level Encryption" to be true. Decide
   the forgotten-passphrase policy first; it is the real product question.

**Phase 2: backend, one project.** Only start once the copy already says "Coming soon".

8. **Accounts (B1)**, then **sync (B2)**, then **encrypted sync**, then **sharing (B3)**, then
   **paid tiers (B4)**. `Todo.md` sections 2-4 describe this chain. Step 4's ids and tombstones are
   what make sync possible.

Housekeeping: drop `zustand` and `@dnd-kit/*` from `package.json` if you do not start on stores or
drag and drop soon (kept for now, at your request).
