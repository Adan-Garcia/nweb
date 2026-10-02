# Cuervo Planner (`cuervoclient`)

[![CI](https://github.com/Adan-Garcia/nweb/actions/workflows/ci.yml/badge.svg)](https://github.com/Adan-Garcia/nweb/actions/workflows/ci.yml)

A local-first homework planner and note-taking app for students: a calendar, a task board, a dashboard, and a notes workspace that combines a rich-text editor with an infinite canvas. It works entirely in the browser, offline included; an optional account syncs it between devices and shares courses with classmates, end-to-end encrypted.

> **Status: early beta.** Everything — notes, tasks, files and the workspace hierarchy — is stored in the browser (IndexedDB), and the app is complete without a server. Each device has a local account (name, email and passphrase, made at `/auth/signup`), and the passphrase encrypts note content *and* the names the workspace is listed by (note titles, course names, task titles) on this device under an Argon2id-derived key. A sync account on a server (`server/`, see [`docs/backend.md`](./docs/backend.md)) is optional: it can be added at sign-up or in Settings → Sync server, on any server address you choose, and brings encrypted sync, sharing of a course, unit or note, and push reminders; the server stores only what it cannot read, and the account can be disconnected or deleted from Settings. Due dates and times stay readable on purpose, so that server can still send a reminder.

## Features

- **Planning:** a month and week calendar and a Todo / Started / Done board, both drag-and-drop, and a dashboard of what is due, overdue and recently edited.
- **Notes:** linear notes in TipTap, spatial notes on a pressure-sensitive drawing canvas (infinite, or Letter/A4 pages) with PDF import and image drop, browsed by path or as a tree.
- **Privacy:** a passphrase lock, encrypted backups, and optional end-to-end encrypted sync and sharing.
- **Everywhere:** installable, works offline, a ⌘K command palette, and a phone layout with a tab bar.
- **Yours:** five themes, eight accent colours, density and text size, and a sidebar and dashboard you can reorder — synced with your account.

## Stack

React 19, TypeScript 6 (strict), Vite 8, Tailwind CSS v4, shadcn/ui (`base-nova`), React Router 7, React Hook Form + Zod 4, Zustand (UI state), cmdk and sonner, TipTap (linear notes), a canvas of its own with `perfect-freehand` (spatial notes), pdf.js (PDF import), `idb` (IndexedDB), and a Web Worker for image optimization and text compression. The optional server is Hono on Postgres. Unit and component tests use Vitest, React Testing Library, MSW and `fake-indexeddb`; browser-level tests use Playwright.

## Getting started

Requires **Node.js 22.13 or newer** (`pdfjs-dist` v6).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server. |
| `npm run typecheck` | Type-check every project (`tsc -b`). |
| `npm run lint` | ESLint, type-aware. |
| `npm run format` | Format with Prettier (`format:check` verifies without writing). |
| `npm run test` | Run the test suite once. `test:watch` and `test:coverage` are also available. |
| `npm run test:e2e` | Browser tests (Playwright) against a production build. First run: `npx playwright install chromium`. |
| `npm run build` | Type-check and produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run build:server` / `npm run start:server` | Bundle and run the sync server. Needs `DATABASE_URL` and `SERVER_SECRET`. |
| `docker compose up --build` | The server and Postgres together. Needs `POSTGRES_PASSWORD` and `SERVER_SECRET` in a git-ignored `.env`. |

The app talks to a server only once one is chosen: `VITE_API_URL` sets the default (for example `VITE_API_URL=http://localhost:8787 npm run dev`), and Settings → Sync server, or the sign-up form, can point a device at any other. With none, nothing is ever sent. [`docs/backend.md`](./docs/backend.md) ("Running it") has the details, and [`docs/deploy.md`](./docs/deploy.md) puts the app and the server on the internet through a Cloudflare Tunnel — on one origin, or with the app on your own site.

Before opening a change, run `npm run format:check && npm run typecheck && npm run lint && npm run test && npm run build`, and `npm run test:e2e` if you touched the notes canvas, PDF import, appearance or a page flow. To make `git blame` skip the one-off formatting commit, run `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Project layout

```
src/
  pages/               One file per route, composition only (lazy-loaded from App.tsx)
  components/
    ui/                shadcn/ui primitives (generated, do not hand-edit)
    layout/            Page header, container, skeleton, empty state, brand icon
    shell/             The workspace shell: sidebar, phone tab bar, notifications, toasts
    theme/             Theme menu and the appearance option labels
    command-palette/   ⌘K palette
    auth/  lock/       Sign-in and sign-up screens; the lock and rekey screens
    calendar/ board/ dashboard/ onboarding/ marketing/
    notes/             Notes workspace hooks, with spatial/, linear/, location/ and tree/
    settings/          One folder per settings card (appearance, account, backup, …)
  hooks/               Hooks shared by more than one feature
  stores/              Zustand stores for state shared across unrelated trees
  lib/                 No React. Grouped by domain: crypto, db, hierarchy, twigs, notes,
                       media, lock, backup, preferences, account, api, keys, push, sync
  workers/             Web Worker entry points
  test/                Shared test setup (jsdom, fake-indexeddb, MSW)
server/                The optional sync server (see docs/backend.md)
shared/                Wire contracts both sides import
docs/                  The backend design, the data hierarchy, the feature checklist
```

Browser-level tests live in `e2e/` at the repo root (Playwright: the real canvas, PDF import, drag-and-drop, fullscreen, offline, the lock, and the theme painted before any script runs).

## Domain model

Notes are organised as **Wing** (workspace) > **Flight** (term) > **Branch** (course) > **Nest** (tag/unit) > **Feather** (note), with **Twigs** (tasks) and **Pebbles** (files). See [`docs/hierarchy.md`](./docs/hierarchy.md).

## Licence

MIT, see [`LICENSE`](./LICENSE). `package.json` keeps `"private": true` because this is an
application rather than a published npm package; it does not restrict the licence.

## Conventions

The engineering standards for this repository (architecture layers, naming, testing, dependency rules, and what is enforced by tooling) live in [`CLAUDE.md`](./CLAUDE.md). It also tracks known gaps.

Two things worth knowing before touching dependencies:

- Never run `npm audit fix --force`. It bumps `pdfjs-dist` a major.
- Keep `pdfjs-dist` on v6, and import its legacy build.
