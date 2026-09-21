# Features promised by the site vs. what the app does

Audit date: 2026-09-20. Sources: every public page (landing, pricing, privacy, documentation,
sign-in, sign-up, `/auth`, onboarding), `Heirarchy.md`, `Todo.md`, `notes.md`. Each row was checked
against the code, not against the README.

**What actually exists:** a front-end-only app. No backend, no accounts, no network calls of its own
(the only `fetch` is `scene-utils.ts:46`, turning a `data:` URL into a Blob). Notes live in IndexedDB,
calendar events in `localStorage`. The sign-in and sign-up forms validate input and do nothing else
(`login-form.tsx:62`, `signup-form.tsx:52`). The README already says this; the site does not.

Legend: **Absent** = nothing in the code. **Partial** = some of it works.

---

## 0. Fix first: statements that are false today (not roadmap)

These are worded as fact, not as plans. The privacy page is the most serious, because it describes
security properties the app does not have. Nothing is encrypted anywhere: there is no
`crypto.subtle`, no key, no cipher in `src/`.

| # | Where | What it says | Reality |
| --- | --- | --- | --- |
| 1 | `privacy-content.ts:23-26` | Data is encrypted before it leaves the device; unique AES-GCM keys per course and note; private keys stay on device; "100% open-source ... can be independently verified" | No encryption code exists. No LICENSE file, `package.json` is `"private": true`, and the app never links to the repo. The claim cannot be verified by anyone reading the site. |
| 2 | `privacy-content.ts:33-35` | Shared workspaces use key exchange; row-level policies; revocation and key rotation | No sharing, no server, no keys, no RLS. |
| 3 | `privacy-content.ts:14,16,43` | Collects "email and profile details", "operational logs", syncs encrypted copies to the cloud | Nothing is collected or sent. Also a dated policy (`privacy.tsx:22`, "Last updated: April 15, 2026") that describes a service that does not run. |
| 4 | `privacy-content.ts:59-69` | "Before your notes leave your device, they are scrambled" / "only your key can unlock it" | No scrambling, no key. Notes are compressed (gzip) but not encrypted; the calendar is plain JSON in `localStorage`. |
| 5 | `landing-benefits.tsx:34-35` | "Device Level Encryption: Your data is encrypted at the device level" | Not encrypted. IndexedDB and `localStorage` are plain. |
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
  "Easy sharing" to "Coming soon" or remove them (see section 1).
- Keep `documentation-content.ts:36-66` as is: it is already headed as a roadmap
  ("Prioritized from your current Todo roadmap", `documentation.tsx`).

Pricing paid tiers stay "Coming Soon" as requested (`pricing-tiers.ts:35,47`).

---

## 1. Claimed and absent

### Accounts and security
| Feature | Claimed at | Status |
| --- | --- | --- |
| Create an account / sign in | `signup.tsx`, `signin.tsx`, `unlogged.tsx`, `onboarding-steps.ts:14-17` ("You've successfully created your account") | **Absent.** Forms validate, then do nothing. There is no session, no user object, no route guard. |
| Forgot password | `login-form.tsx:83` | **Absent.** `href="#"`. |
| Log out | `workspace-sidebar.tsx:90-92` | **Absent.** Button has no handler. |
| Notifications (bell) | `workspace-sidebar.tsx:84-86` | **Absent.** No handler, no notification model. |
| Settings | `workspace-sidebar.tsx:87-89` | **Absent.** No handler, no settings page. |
| Device-level encryption, keypairs, AES-GCM data keys, `CryptoService` | `landing-benefits.tsx:34`, `Todo.md` section 3, `documentation-content.ts:60` | **Absent.** |
| Zero-knowledge envelope encryption | `Todo.md` section 3 | **Absent.** |

### Sync and offline
| Feature | Claimed at | Status |
| --- | --- | --- |
| Fast syncing across all devices | `landing-benefits.tsx:19-20` | **Absent.** No sync layer of any kind. |
| Cross platform "on all your devices, seamlessly" | `landing-benefits.tsx:44-45`, `pricing-tiers.ts:19` | **Absent** as sync. The web app opens on any browser, but each device has its own separate data. |
| Real-time sync, Supabase, optimistic concurrency, field-level merge | `documentation-content.ts:48-53`, `Todo.md` section 2 | **Absent.** No Supabase dependency, no `SyncService`. |
| PWA (manifest, offline asset caching), Tauri desktop wrapper | `Todo.md` section 5 | **Absent.** `public/` has only icons; no manifest, no service worker, no `vite-plugin-pwa`. Not installable and not usable offline after a cold start with no network. |

### Sharing and collaboration
| Feature | Claimed at | Status |
| --- | --- | --- |
| Share notes and homework with friends, family, classmates | `landing-benefits.tsx:39-40`, `unlogged.tsx:39` ("Planning, Notes, and Sharing") | **Absent.** |
| Invite Your Flock: members, permissions, real-time collaboration | `onboarding-steps.ts:29-33` | **Absent.** The step is text only. |
| Multiple wings per user, one owned | `Heirarchy.md:6`, `documentation-content.ts:11` | **Absent.** "Wing" is a free-text string on a note; there is no user or wing entity. |
| Key exchange, RLS, revocation and key rotation | `documentation-content.ts:61-62`, `Todo.md` section 4 | **Absent.** |

### Paid tiers (labelled "Coming Soon", so honest; listed for completeness)
Supporter-only faster servers, higher storage limits, faster support (`pricing-tiers.ts:31-33`);
private team servers, frequent cloud backups (`pricing-tiers.ts:43-45`). No servers exist, so none of
these can be delivered yet.

### Data model
| Feature | Claimed at | Status |
| --- | --- | --- |
| **Twigs** (tasks: homework, exams, essays) | `Heirarchy.md:17`, `documentation-content.ts:26-27` | **Absent.** Calendar events have a title/date/time/status but are not linked to a course or a note. No task entity, no kanban view. |
| **Pebbles** (files as their own entity) | `Heirarchy.md:19` | **Absent** as an entity. PDFs and images are embedded in a note's canvas, not stored or listed as files. |
| **Nest as a tag** applied to notes and homework | `Heirarchy.md:14-15`, `documentation-content.ts:22-23` | **Absent as a tag.** Nest is one path segment of a note's location (`location-hierarchy.ts:11`), not something you can attach to several items or to a task. |
| Branch "keeps class notes, tasks, and labels together" | `documentation-content.ts:18-19` | **Partial.** Notes only. Calendar events use a hard-coded subject list (`calendar-event.ts:3-9`: Math, History, Physics, GroupWork, Chemistry), not your branches. |
| Feathers are **markdown** notes | `documentation-content.ts:27` | **False as worded.** Linear notes are stored as HTML from TipTap (`linear-notes-editor.tsx:38`); `Heirarchy.md` says JSON. Neither is markdown. |
| Integrated note editor with tasks embedded in rich text | `Todo.md` section 1 | **Absent.** No task embedding or tagging in the editor. |

### Interaction
| Feature | Claimed at | Status |
| --- | --- | --- |
| Drag and drop calendar and kanban (`@dnd-kit`) | `documentation-content.ts:44`, `Todo.md:13` | **Absent.** `@dnd-kit/*` is in `package.json:22-24` but imported nowhere; the calendar has no drag handlers and there is no kanban. |
| Zustand stores (`usePlannerStore`, `useEventStore`) | `documentation-content.ts:42`, `Todo.md:6-7` | **Absent.** `zustand` is in `package.json:47` but imported nowhere. |
| Typed `DecryptedTask` / `DecryptedNote` / `EncryptedPayload` | `documentation-content.ts:43` | **Absent.** Nothing is encrypted, so the types do not exist. |

### Dead links
| Link | Where | Status |
| --- | --- | --- |
| "View our guides" | `onboarding.tsx:54` | `href="#"`. There are no guides; `/documentation` is the roadmap, not a guide. |
| "About" | `marketing-nav.ts:16` (landing) and `:8` (others) | Landing: `href="#"`. Other pages: points at `/`. No About page. |
| Brand mark link | `landing-header.tsx:54`, `onboarding.tsx:19` | `href="#"`. |
| "Onboarding" itself | `/auth/onboarding` | Reachable only by typing the URL; nothing links to it, and its "Create your first wing" / "Invite your flock" steps do not create or invite anything. |

---

## 2. Claimed and partial

| Claim | Where | What works | What does not |
| --- | --- | --- | --- |
| Local-first, data stored on your device | `signup.tsx:12,17`, `unlogged.tsx:43` | **True.** IndexedDB (notes) + `localStorage` (calendar). | Clearing site data deletes everything; there is no export or backup. |
| Offline first | `landing-benefits.tsx:49-50` | Once loaded, the app has no network dependency. | "your data will sync once you're back online" has no sync behind it. No service worker, so a cold offline start fails. |
| Private by default | `landing-benefits.tsx:14-15`, `pricing-tiers.ts:16` | Nothing leaves the browser. | Not "locked to your account" (see 0.7). |
| Open Source, forever / on GitHub | `landing-benefits.tsx:24-25`, `pricing.tsx:22,48`, `pricing-tiers.ts:21`, `signup.tsx:12` | A GitHub remote exists (`Adan-Garcia/nweb`). | No link to it anywhere on the site, no LICENSE file (without one the code is legally all-rights-reserved), `"private": true` in `package.json`. |
| Free beta through 2027 | `landing-benefits.tsx:30`, `pricing-tiers.ts:11`, `signup.tsx:22` | True by default. | A date commitment; make sure you want to keep it. |
| Notes organised by Wing > Flight > Branch > Nest > Feather | `Heirarchy.md`, `documentation-content.ts:8-27` | Notes are addressed by all five levels and browsable by them (`use-notes-workspace.ts`). | The levels are strings, not entities, so you cannot rename, reorder or delete a Wing/Branch, or list "all my courses". |
| Flights sorted into Summer / Fall / Spring + year | `Heirarchy.md:9`, `documentation-content.ts:14-15` | A new note defaults to the current term (`constants.ts:19-27`). | The value is free text after that. Nothing groups or sorts notes by term. |
| Brotli text compression | `notes.md:21-22` | The worker tries `br` first (`media-worker.ts:84`). | Chromium rejects `br`/`brotli` in `CompressionStream` (checked with Playwright: `br:false, brotli:false, gzip:true`), so it silently falls back to **gzip**. Same for other browsers unless they add support. |
| Files (PDFs, images) | `Heirarchy.md:19`, `notes.md:29-31` | PDF import and image paste/drop onto the canvas; images optimised to WebP and stored as blobs. | Not a file manager (see Pebbles, above). |
| Calendar and dashboard as part of the planner | `Todo.md:12-14`, `landing` | Both work and share data. | Calendar events are not linked to notes or courses. |
| shadcn/ui, Zod + React Hook Form | `Todo.md:9-11` | Done. | (Not a gap; listed so the checklist can be ticked.) |

---

## 3. Implemented but not mentioned on the site

Worth advertising, since the site currently sells things you do not have and hides things you do.

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

## 4. Suggested order of work

1. **Copy fixes (section 0).** No new features, removes the false statements. Small.
2. **Dead controls (section 1, dead links + sidebar).** Either hide the bell/settings/logout and the
   "Forgot password" / "View our guides" / "About" links, or build them.
3. **Add a LICENSE, link the repo** so "Open Source" is true and checkable.
4. **Data model:** promote Wing/Flight/Branch to real entities, add Twigs linked to a Branch, and make
   calendar events reference a Branch instead of the five hard-coded subjects. This is what the
   documentation page and `Heirarchy.md` describe, and it unlocks most of the dashboard.
5. **PWA** (manifest + service worker): makes "offline first" and "cross platform" true without a
   backend.
6. **Export/import** of your data (JSON), so "local-first" has a backup story.
7. **Backend + accounts + sync**, then **encryption**, then **sharing.** These are one project
   (`Todo.md` sections 2-4) and each depends on the one before; only start once the copy already
   says "Coming soon".
8. Drop `zustand` and `@dnd-kit/*` from `package.json` if you do not start on stores or drag and drop
   soon (kept for now, at your request).
