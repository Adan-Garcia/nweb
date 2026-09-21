# Cuervo Planner (`guerraclient`)

[![CI](https://github.com/Adan-Garcia/nweb/actions/workflows/ci.yml/badge.svg)](https://github.com/Adan-Garcia/nweb/actions/workflows/ci.yml)

A local-first homework planner and note-taking app for students: a calendar, a dashboard, and a hybrid notes workspace that combines a linear rich-text editor with an infinite spatial canvas.

> **Status: early beta, front end only.** There is no backend. Everything — notes, tasks, files and the workspace hierarchy — is stored in the browser (IndexedDB). The sign-in and sign-up forms validate input but do not authenticate, and the sync and sharing described on the marketing pages are the project's direction, not yet implemented. Encryption is implemented: set a passphrase in Settings and note content *and* the names the workspace is listed by — note titles, course names, task titles — are encrypted on this device under an Argon2id-derived key. Due dates and times stay readable on purpose, so that a future server holding only ciphertext could still drive a reminder.

## Stack

React 19, TypeScript 6 (strict), Vite 8, Tailwind CSS v4, shadcn/ui (`base-nova`), React Router 7, React Hook Form + Zod 4, TipTap (linear notes), Excalidraw (spatial notes), pdf.js (PDF import), `idb` (IndexedDB), and a Web Worker for image optimization and text compression. Unit and component tests use Vitest, React Testing Library, MSW and `fake-indexeddb`; browser-level tests use Playwright.

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

Before opening a change, run `npm run format:check && npm run typecheck && npm run lint && npm run test && npm run build`, and `npm run test:e2e` if you touched the notes canvas, PDF import or a page flow. To make `git blame` skip the one-off formatting commit, run `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Project layout

```
src/
  pages/               One file per route, composition only (lazy-loaded from App.tsx)
  components/
    ui/                shadcn/ui primitives (generated, do not hand-edit)
    calendar/          Calendar feature: components, hooks, pure date logic
    dashboard/         Dashboard cards and metrics
    marketing/         Public pages: header, cards, page copy
    notes/             Notes feature: editors, hooks, IndexedDB-facing helpers
    onboarding/        Onboarding steps
  hooks/               Hooks shared by more than one feature
  lib/                 Storage modules, worker client, pure utilities (no React)
  workers/             Web Worker entry points
  test/                Shared test setup (jsdom, fake-indexeddb, MSW)
```

Browser-level tests live in `e2e/` at the repo root (Playwright: the real canvas, PDF import, drag-and-drop, fullscreen).

## Domain model

Notes are organised as **Wing** (workspace) > **Flight** (term) > **Branch** (course) > **Nest** (tag/unit) > **Feather** (note), with **Twigs** (tasks) and **Pebbles** (files). See [`Heirarchy.md`](./Heirarchy.md).

## Licence

MIT, see [`LICENSE`](./LICENSE). `package.json` keeps `"private": true` because this is an
application rather than a published npm package; it does not restrict the licence.

## Conventions

The engineering standards for this repository (architecture layers, naming, testing, dependency rules, and what is enforced by tooling) live in [`CLAUDE.md`](./CLAUDE.md). It also tracks known gaps.

Two things worth knowing before touching dependencies:

- Never run `npm audit fix --force`. It downgrades `@excalidraw/excalidraw` and breaks the app; the remaining advisories are handled by the `overrides` block in `package.json`.
- Keep `@excalidraw/excalidraw` on `^0.18` and `pdfjs-dist` on v6.
