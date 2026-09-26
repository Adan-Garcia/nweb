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

## A1. Nothing, for the first time

Everything on this list that could be built without a server has been. The workspace lock
encrypts note content and every display name under an Argon2id-derived key; a passphrase
can be set, changed in one pass, removed, and — if any of those is interrupted — finished
from where it stopped, with the rows converted so far reported as it goes. A backup can be
restored over the workspace or merged into it. The notes tree opens, renames and deletes.

Dates and times are left readable by design, which is a rule rather than a gap:
`CLAUDE.md` §5 and `sealed-text.ts` say why.

What is left is genuinely inherent, and is recorded in `CLAUDE.md` §13 rather than here:
a workspace nobody opens never sweeps its tombstones, and a first visit closed before the
browser goes idle leaves routes that will not open offline. Neither has a fix that does
not need a server or a background process.

An earlier plan wanted a Tauri wrapper, for native performance and for WebCrypto. The PWA
has WebCrypto and installs, so the reason has gone; it is not listed as a gap because
nothing is missing without it.

---

# Part B. Needs a backend

None of these can be true without a server, because each one involves identity, a second
device, a second person, or money. In dependency order; each depends on the one before.
**`BACKEND.md` is the plan for all of it** — the key model, the schema, the endpoints and
what the design costs. `CLAUDE.md` §2.3 says how the client half attaches: a dedicated
`src/lib/api/` service module, Zod-validated responses, and approval before adding a
data-fetching library.

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
| Real-time sync, optimistic concurrency | `documentation-content.ts` | **Absent.** `BACKEND.md` has the protocol: a server-assigned sequence, last write wins on the client. |
| Encrypted sync (zero-knowledge envelope) | `BACKEND.md` | The client half is done. Every row's content and name is sealed before it is stored, and each one records which cipher wrote it, so a server could hold exactly these rows and read none of them. The server storing them is what is missing. |

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
| Key exchange, RLS, revocation, key rotation | `documentation-content.ts`, `BACKEND.md` | **Absent.** Needs a server to hold public keys and enforce access. Sharing is meant to work at any level of the hierarchy — a wing, a course, a tag or one note — which needs a key per object wrapped under the containers above it, not the single key per browser the cipher seam holds today. |

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
