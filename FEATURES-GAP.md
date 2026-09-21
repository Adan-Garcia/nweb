# What the site promises that the app does not do yet

Rewritten 2026-09-21. This file lists only what is **still missing**. Everything that has
shipped has been deleted from it rather than ticked off — the git log is the record of what
was done, and a gap list that is mostly closed items stops being read.

Every row was checked against the code, not against the README.

## Where the app is now

A front-end-only app, and an honest one. Notes, tasks, files and the whole Wing → Flight →
Branch → Nest → Feather hierarchy are real records in IndexedDB, and all of it can now be
renamed, recoloured and deleted from Settings. There is a calendar, a board, a dashboard
and in-app notifications. It installs as a PWA and starts offline. Notes are
Brotli-compressed, and a passphrase encrypts their content **and** the names the workspace
is listed by, under a key derived with Argon2id. Backups export and import, optionally
encrypted.

There is still **no server**, so there is no account, no sync, no sharing and nothing to
pay for. The site says so.

---

# Part A. Still missing, and buildable with no backend

## A1. Encryption: what is left

The workspace lock now encrypts note content — the text, the drawings, the bytes of every
image and PDF — and every display name: note titles, course names, task titles, file names.
A passphrase can be set, changed in one pass, and removed. Dates and times are left
readable by design, which is a rule rather than a gap: `CLAUDE.md` §5 and `sealed-text.ts`
say why.

| Gap | Where | Why it is not done |
| --- | --- | --- |
| The rekey has no progress and no resume | `workspace-rekey.ts` | Setting, changing or removing a passphrase rewrites every row serially. A failure partway leaves some rows converted; the caller ordering means the recoverable state is the one the old key opens, but a user with a gigabyte of PDFs still sits on a spinner with nothing to look at. |
| Restore is replace-only | `workspace-restore.ts` | Applying a backup clears every store first. There is no merge, so restoring onto a device that has been used since loses what it did. A merge needs the same conflict rules sync will need, so it is waiting on B2 rather than being separately hard. |

## A2. Smaller things

| Gap | Where | Note |
| --- | --- | --- |
| The tree can only open notes | `notes-file-viewer.tsx` | The sidebar is a toggle beside the path bar now and lists every saved note. Renaming, moving and deleting still happen elsewhere, and which groups are expanded is component state, so it resets on reload. |
| Tombstone collection is a startup guess | `tombstones.ts` | Markers older than ninety days are swept once per load from `WorkspaceShell`. The window was chosen before any sync exists to need it, and a workspace nobody opens never sweeps. |
| Route warm-up is best effort | `route-warmup.ts`, `public/sw.js` | The unvisited page chunks are imported on idle so the worker caches them. A first visit closed before it goes idle still leaves routes that will not open offline. |

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
| Encrypted sync (zero-knowledge envelope) | `Todo.md` section 3 | The client half is done. Every row's content and name is sealed before it is stored, and each one records which cipher wrote it, so a server could hold exactly these rows and read none of them. The server storing them is what is missing. |

**The prerequisites are already met:** every record has a UUID, `updatedAt` and a
`deletedAt` tombstone, which is what makes a merge and a delete safe — and its dates are
in the clear, which is what would let a server schedule a reminder it cannot read.

**No-server stopgap:** the export/import file moves data between devices by hand. It is a
backup, not sync, and the site should not call it sync.

## B3. Sharing and collaboration

| Feature | Claimed at | Status |
| --- | --- | --- |
| Share notes and homework | `landing-benefits.tsx` (Coming soon), `unlogged.tsx` | **Absent.** |
| Invite Your Flock: members, permissions, real-time collaboration | `onboarding-steps.ts` | **Absent.** The step is text only. |
| A user belongs to many wings but owns exactly one | `Heirarchy.md`, `documentation-content.ts` | **Half.** Several local wings work, and can now be renamed and deleted. Membership and ownership need users. |
| Key exchange, RLS, revocation, key rotation | `documentation-content.ts`, `Todo.md` section 4 | **Absent.** Needs a server to hold public keys and enforce access. A shared workspace also needs a key per wing rather than one per browser, which the cipher seam allows but does not yet do. |

## B4. Paid tiers

Labelled "Coming Soon" throughout, so honest. Supporter-only faster servers, higher storage
limits, private team servers, frequent cloud backups. No servers exist, and they also need
billing and support tooling, which is outside the app.

---

# Part C. Split: the front-end half is done, the rest needs a server

| Feature | Done, no backend | Still needs the backend |
| --- | --- | --- |
| **Encryption** | Argon2id-derived AES-GCM over note content and every display name, the app lock, change-passphrase, and encrypted backups. | Keypairs, envelope keys, key exchange, revocation, and storing only ciphertext on a server (B2, B3). |
| **Wings** | Several local wings as real records, editable from Settings. | Membership and ownership across users (B3). |
| **Sharing** | Export/import a file to send someone a copy. | Live shared workspaces, permissions, real-time edits (B3). |
| **Notifications** | The in-app bell: overdue, due today, due this week. | Push and email when the app is closed — which is why due dates are stored in the clear. |
| **Onboarding steps** | "Create your first wing" could create a local wing. | Invites (B3). |
| **Settings** | Theme, backup, workspace lock, workspace editor. | Account, email, billing, devices (B1). |
| **Backups** | Manual export, optionally encrypted. | Automatic cloud backups, a paid-tier feature (B4). |

---

# Part D. Order of work

1. **The backend, as one project:** accounts (B1), sync (B2), encrypted sync, sharing
   (B3), paid tiers (B4). Everything above it that could be built without a server has
   been.
2. **Rekey progress**, if anyone reports the spinner. It is a real wait on a large
   workspace and the only place the app asks for patience without saying how much.
3. **A merge-style restore**, alongside sync rather than before it: both need the same
   conflict rules, and writing them twice would be writing them differently.

CI is in place (`.github/workflows/ci.yml`), so each of these is gated on the same checks
from the first commit rather than from whenever someone remembers to run them.
