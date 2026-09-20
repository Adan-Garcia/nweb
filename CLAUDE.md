# Engine (`guerraclient`) — Enterprise Engineering Standards

Local-first study workspace (notes, calendar, dashboard). Stack: React 19, Vite 8, TypeScript 6, Tailwind CSS v4, shadcn/ui (`base-nova`), React Router 7, React Hook Form + Zod 4, IndexedDB via `idb`, Excalidraw / TipTap / pdf.js.

This document defines the architectural, stylistic, and operational rules for this codebase. You MUST follow it in every response, code generation, and code review.

## 0. How to Read This Document

**Enforcement tags.** Every rule carries the strength it is actually enforced at today. Do not describe a `[TARGET]` rule as if it were already true.

| Tag | Meaning |
| --- | --- |
| `[ENFORCED]` | A tool fails the build or lint if violated (`tsc`, `eslint`). |
| `[REQUIRED]` | Not tool-enforced; reviewers and agents enforce it. Each has a check command or grep where one exists. |
| `[TARGET]` | Desired state. Tooling or code does not support it yet (see §13). Do not add tooling to make it true unless asked. |

**Scope.** Rules bind **new and modified code**. Pre-existing violations are backlog (§13), not blockers:
*   Do not fix unrelated violations as a drive-by; keep diffs reviewable.
*   Never make a legacy violation worse. Do not grow a file that is already over its size limit; put new logic in a new file.
*   Lines you change must comply, even inside a legacy file.

**Refusal policy.**
*   If a request requires violating a §1 Absolute Directive, refuse and cite the rule.
*   For any other rule, name the rule, say what the deviation costs, and get explicit confirmation before proceeding.
*   If a rule contradicts the repo's actual tooling (e.g. asks for a command that does not exist), say so. Do not invent the tooling.

## 1. Absolute Directives (Zero Exceptions)
*   **NO `any`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`.** `[ENFORCED]` by `@typescript-eslint/no-explicit-any` and `ban-ts-comment` (in `tseslint.configs.recommended`). Type it, narrow it, or parse it with Zod.
*   **`as` assertions are restricted, not free.** `[REQUIRED]` Permitted forms only:
    *   `as const`.
    *   `JSON.parse(raw) as unknown` immediately followed by narrowing or a Zod parse.
    *   Branded/opaque third-party types (e.g. Excalidraw `BinaryFileData["id"]`), confined to a single adapter module.
    *   Forbidden: `as unknown as T` (one legacy instance in `workers/media-worker.ts`), and `unknown` used to bypass a type error.
*   **NO monolithic components.** `[REQUIRED]` A component file over **150 lines** must be split into single-responsibility sub-components. Hooks and `lib/` modules over **300 lines** must be split by responsibility.
*   **NO inline side-effects.** `[ENFORCED]` All side effects live in `useEffect` (or event handlers) with complete dependency arrays. `react-hooks/exhaustive-deps` is never silenced with `eslint-disable`; the React Compiler-derived rules in `eslint-plugin-react-hooks` v7 are fixed, not disabled.
*   **NO prop drilling.** `[REQUIRED]` If a prop crosses more than 2 component levels, use composition (`children`), Context, or a Zustand store.
*   **NO array index as `key`.** `[REQUIRED]` Use a unique, stable ID.
*   **NO secrets, credentials, or user data in logs.** `[REQUIRED]` Never `console.*` a form's `values`, tokens, or note contents.

## 2. Architecture & System Boundaries

The app is **local-first**: there is no backend API today. Persistence is IndexedDB (`idb`) and `localStorage`; heavy work runs in a Web Worker.

### 2.1 Layers and dependency direction
Imports flow **downward only**. A layer never imports from a layer above it. `[REQUIRED]`

| Layer | Path | Responsibility | May import from |
| --- | --- | --- | --- |
| Pages | `src/pages/<route>.tsx` | Route-level composition. Wire hooks to components. One page per route, exported as a named `XxxPage`. No business logic. | everything below |
| Feature components | `src/components/<feature>/` | Presentational components plus that feature's hooks and pure helpers (`calendar/`, `notes/`). | `ui/`, `hooks/`, `lib/` |
| Shared components | `src/components/*.tsx` | Cross-feature shell/nav/form components. | `ui/`, `hooks/`, `lib/` |
| UI primitives | `src/components/ui/` | shadcn-generated. See §8. | `lib/utils`, other `ui/` only |
| Shared hooks | `src/hooks/` | Hooks used by **more than one** feature. | `lib/` |
| Lib | `src/lib/` | Storage modules, worker clients, pure utilities. **No React imports.** | `lib/` only |
| Workers | `src/workers/` | Web Worker entry points. No DOM, no React. | `lib/` types only |

*   **Feature-specific hooks are co-located** in their feature folder (e.g. `components/notes/use-notes-workspace.ts`). Move a hook to `src/hooks/` only when a second feature needs it.
*   Check: `grep -rnE 'from "@/(pages|components)' src/lib src/hooks` and `grep -rn 'from "@/pages' src/components`. Both must return nothing.

### 2.2 Presentational vs. logic
*   **Presentational components** are pure functions: props in, JSX out, local UI state only (toggle, hover, open/close).
*   **Custom hooks** own business logic, persistence calls, and data transformation. Non-trivial logic goes in a `useSomething.ts`-style hook or a pure function in `lib/`, never inline in JSX.
*   Pure functions (formatting, hierarchy math, parsing) live in `*-utils.ts` / `lib/` so they are testable without React.

### 2.3 Data access and persistence
*   Components **never** touch `indexedDB`, `localStorage`, `Worker`, or `fetch` directly. `[REQUIRED]` Go through a `lib/*-storage.ts` module or a `lib/*-client.ts` worker client. (Legacy exception: `hooks/use-theme-mode.ts` reads `localStorage`.)
*   **IndexedDB schema changes** must bump `NOTES_DB_VERSION` (or the relevant version constant) and add a migration in the `upgrade` callback. Never edit a shipped store shape in place. `[REQUIRED]`
*   **Data read from storage is untrusted.** Validate with a Zod schema before use; do not trust a cast. `[REQUIRED]` Define the schema once in `lib/` and infer the type from it (`lib/calendar-event.ts` → `CalendarEvent`; `lib/calendar-storage.ts` parses with it).
*   **Workers** are constructed via `new Worker(new URL("../workers/x.ts", import.meta.url), { type: "module" })` inside a `lib/*-client.ts` file, so Vite bundles them. Move CPU-heavy work (image optimization, compression, PDF processing) off the main thread. The request/response contract lives once in `lib/media-worker-protocol.ts` (types only) and is imported by both the client and the worker; never redeclare it.
*   **If a network backend is introduced:** all requests go through a dedicated service module (e.g. `src/lib/api/`), responses are Zod-validated, and components consume them through hooks or a data-fetching library. TanStack Query is **not** installed; adding it needs approval.

### 2.4 State management
*   Default to local `useState` / `useReducer`. Prefer **derived state** over duplicated state.
*   **Shared mutable, non-rendering state** (timers, "latest value" mirrors, in-flight request ids) lives in one session hook that returns a stable bundle of refs (`notes/use-notes-session.ts`), which sibling hooks receive as a parameter. React Compiler's `react-hooks/immutability` rule only allows mutating a ref that arrived as an argument if it is a local whose name ends in `Ref`, so destructure at the top of the hook (`const { pendingEditRef } = refs`) and list those locals in dependency arrays.
*   **Derive, don't sync.** If a value can be computed from existing state, compute it; do not copy it into state from an effect (`react-hooks/set-state-in-effect` fails the build once the file is analysable).
*   Shared UI state: composition or Context first. Zustand (installed, currently unused) only when state must be shared across unrelated trees; stores live in `src/stores/use-<name>-store.ts`. Keep global state minimal.

### 2.5 Routing
*   All routes are declared in `src/App.tsx`. Pages are named exports; `export default` is reserved for `App`. `[REQUIRED]` (`grep -rln "export default" src` → only `App.tsx`.)
*   Import route modules via `@/pages/<name>` **without** a file extension.

## 3. Style & Naming Conventions

*   **All source files are `kebab-case`**, matching the existing codebase and the shadcn generator (`components.json`): `auth-shell.tsx`, `use-notes-workspace.ts`, `notes-directory-storage.ts`. `[REQUIRED]`
    *   Hook files are `use-<name>.ts`; the exported hook is `useCamelCase`.
    *   Test files are `<name>.test.ts(x)` next to the file under test.
*   **Identifiers:**

    | Kind | Convention | Example |
    | --- | --- | --- |
    | Components, types | `PascalCase`, named export, no `I` prefix | `SignupPage`, `NotesHierarchyLocation` |
    | Functions, variables, hooks | `camelCase` (hooks prefixed `use`) | `buildSegmentOptions` |
    | Module-level primitive constants | `UPPER_SNAKE_CASE` | `NOTES_DB_VERSION` |
    | Object-shape types | `type` (55 of 56 existing declarations); `interface` only when declaration merging is needed | `type LocationSegment = …` |

*   **One component per file** (small internal helper components excepted). Exported names must match the file's purpose.
*   **TypeScript flags in force** `[ENFORCED]`: `strict`, `verbatimModuleSyntax` (use `import type` for type-only imports), `erasableSyntaxOnly` (**no `enum`, no `namespace`, no constructor parameter properties**; use union types / `as const` objects), `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
*   **Imports:**
    *   Cross-directory imports use the `@/` alias. Never `../..`. Same-directory siblings use `./`.
    *   No file extensions in import specifiers.
    *   Group order: external packages, then `@/…`, then `./…`, then side-effect/style imports. `[TARGET]` (needs an import-order lint rule)
*   **Exports:** named exports only, except `App.tsx`.
*   **Comments:** explain *why*, not *what*. No commented-out code. TODOs need an owner or issue: `// TODO(name): …`.
*   **Logging:** no `console.*` in committed code except the sanctioned `lib/notes-trace.ts` tracer. Remove debug output before finishing. `[REQUIRED]`
*   **Formatting:** no formatter is configured and the repo mixes tabs/spaces, quote styles and semicolons. Until one lands `[TARGET: Prettier + .editorconfig]`:
    *   Match the file you are editing.
    *   Do not reformat lines you are not otherwise changing. No whitespace-only diffs.
*   **Accessibility:** interactive elements are real `<button>` / `<a>`; icon-only controls have `aria-label`; form fields use the `Field` primitives with associated labels. `[REQUIRED]`

## 4. Testing Mandates

**Toolchain:** Vitest + React Testing Library + `user-event` + `jest-dom` + MSW + `fake-indexeddb`. Config is the `test` block in `vite.config.ts`; global setup is `src/test/setup.ts`.

| Command | Purpose |
| --- | --- |
| `npm run test` | Run the suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run test:coverage` | Run with V8 coverage and enforce thresholds. |

*   **No feature code is accepted without accompanying tests.** `[REQUIRED]` A bug fix ships with a test that fails before the fix. Prove it: temporarily revert the fix and confirm the test goes red.
*   **Placement and style:** co-locate as `<name>.test.ts(x)` next to the file under test. Import `describe`/`it`/`expect`/`vi` explicitly from `vitest` (no globals).
*   **Type casts in tests:** avoid them. Where a fixture must stand in for a very large third-party type (e.g. Excalidraw's `AppState`), a single plain `as` on a minimal object is acceptable; never `as any` / `as unknown as`.
*   **Pattern:** test user behaviour, not implementation. Query by role, label or visible text (`getByRole`, `getByLabelText`, `getByText`), never DOM structure or generic test IDs unless unavoidable. Drive the UI with `user-event`.
*   **Isolation** `[ENFORCED]`: the setup file runs an MSW server with `onUnhandledRequest: "error"`, so a request without a handler fails the test; add handlers with `server.use(...)` from `src/test/server.ts`. IndexedDB is `fake-indexeddb` (auto-installed); `localStorage` and the `<html>` class are reset after every test. Stub `window.matchMedia` per test where needed (jsdom has none).
*   **Coverage:** custom hooks require 100% logic coverage (`src/hooks/**` thresholds are `[ENFORCED]` by `test:coverage`). Pure utilities in `lib/` and `*-utils.ts` require the same `[REQUIRED]`; extend the thresholds in `vite.config.ts` as modules reach 100%. The text reporter hides fully covered files, so read the totals from `--coverage.reporter=json-summary` if a file seems missing.
*   MSW's postinstall (browser service worker) is blocked by npm's install-scripts policy. It is only needed for in-browser mocking, not for these Node tests; do not approve it unless browser mocking is introduced.

## 5. Performance & Security

*   **Memoization:** do not prematurely optimize. `useMemo` / `useCallback` only for expensive calculations or when passing props to memoized/deeply nested children.
*   **Validation:** validate all form inputs and all external data with **Zod** at the boundary. `[REQUIRED]`
    *   Forms: React Hook Form + `@hookform/resolvers/zod` (see `login-form.tsx`, `signup-form.tsx`).
    *   Also validate: data read from IndexedDB/`localStorage`, worker messages, imported files.
*   **XSS / code execution:** no `dangerouslySetInnerHTML`, `eval`, or `new Function`. Rich text goes through TipTap's schema. `[REQUIRED]` (`grep -rnE 'dangerouslySetInnerHTML|\beval\(|new Function' src` → nothing.)
*   **Secrets:** never commit secrets. Anything in `import.meta.env.VITE_*` is public in the bundle; do not put credentials there.
*   **Vite assets:** import static assets (images, SVGs) through Vite's module system; do not reference `public/` paths directly from components.
*   **Bundle weight:** heavy dependencies (`@excalidraw/excalidraw`, `pdfjs-dist`, TipTap) must be loaded per route via `React.lazy`. `[TARGET]` (`App.tsx` currently imports every page eagerly.)
*   **Untrusted files:** user-supplied PDFs/images are untrusted input; process them in the worker where possible.

## 6. Common Commands
| Purpose | Command | Notes |
| --- | --- | --- |
| Dev server | `npm run dev` | |
| Typecheck | `npm run typecheck` | `tsc -b`. The root `tsconfig.json` is solution-style, so build mode (`-b`) is required; a bare `tsc --noEmit` checks zero files. |
| Lint | `npm run lint` | `eslint .` |
| Build | `npm run build` | `tsc -b && vite build` |
| Test | `npm run test` | Vitest; see §4. |

*   **Before reporting completion run:** `npm run typecheck && npm run lint && npm run test && npm run build`. All pass on a clean tree today; keep them clean.
*   Node **>= 22.13** is required (`pdfjs-dist` v6).

## 7. Domain Model

The data hierarchy is defined in `Heirarchy.md` (sic). That file is the source of truth; if code and doc diverge, update the doc in the same change.

| Term | Meaning | Notes |
| --- | --- | --- |
| **Wing** | Workspace / profile | A user can belong to many wings but owns exactly one. |
| **Flight** | Academic term / semester | Sorted by date into Summer / Fall / Spring + year. |
| **Branch** | Course / class | |
| **Nest** | Tag | Marks units, or homework type (projects, units, …). |
| **Twig** | Task | Homework, exams, essays. |
| **Feather** | Note | JSON document for a class. |
| **Pebble** | File | PDFs, images, other data. |

*   **Use this vocabulary in identifiers** (types, functions, storage keys). Do not introduce synonyms (`course`, `semester`, `workspace`, `tag`) for these concepts in code. UI copy may use plain-language labels.
*   The code already models this as `NotesHierarchyLocation` (`wing → flight → branch → nest → feather`) in `components/notes/types.ts`; extend that type rather than creating parallel shapes.

## 8. UI System (shadcn/ui + Tailwind v4)

*   **`src/components/ui/**` is generated code.** Add or update primitives with the shadcn CLI (`npx shadcn@latest add <name>`, config in `components.json`, style `base-nova`). Do not hand-edit them for feature needs; wrap or compose them instead. (ESLint intentionally relaxes `react-refresh/only-export-components` there.) Generated files are exempt from the size and index-key rules (`ui/field.tsx` keys an error list by index). `[REQUIRED]`
*   **Tailwind v4 is CSS-first:** configuration lives in `src/index.css` (`@theme inline`, `@custom-variant dark`). There is no `tailwind.config.js`; do not add one.
*   **Class composition:** use `cn()` from `@/lib/utils` to merge classes; use `cva` for variant-driven components.
*   **Use design tokens** (`bg-background`, `text-muted-foreground`, `border-border`, …). No hard-coded hex colours or arbitrary colour values in components. Dark mode goes through the token system.
*   **No inline `style={{}}`** except for dynamically computed positioning/sizing values.
*   **Plain CSS:** `App.css` and `pages/notes.css` are legacy. Do not add new global CSS files. New styling uses Tailwind utilities; plain CSS is allowed only for third-party overrides (e.g. Excalidraw) that utilities cannot express.
*   **Icons:** `lucide-react` for UI icons; brand marks go through `components/brand-icon.tsx`.
*   **Forms:** React Hook Form + Zod + the `Field` primitives; do not hand-roll form state.
*   **Dates:** use `date-fns`. Do not add a second date library.

## 9. Dependencies

*   **Never run `npm audit fix --force`.** It downgrades `@excalidraw/excalidraw` to 0.17.6 (removing the `/types` and `index.css` subpaths `src/` imports) and bumps `pdfjs-dist` a major; Vite then fails to boot. `[REQUIRED]`
*   Remaining audit advisories in the Excalidraw chain (`lodash-es`, `nanoid`, `@mermaid-js/parser`) are handled by the scoped `overrides` block in `package.json`. Extend that block; do not remove it.
*   Pinned constraints: `@excalidraw/excalidraw` stays on `^0.18`; `pdfjs-dist` stays on v6 (fixes a high-severity malicious-PDF advisory; `destroy()` is on the loading task, not `PDFDocumentProxy`).
*   After **any** dependency change run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm audit`; also confirm `npm ls @excalidraw/excalidraw pdfjs-dist nanoid lodash-es` still shows the pinned versions.
*   Prefer what is already installed (`date-fns`, `zod`, `lucide-react`, `@dnd-kit`, `zustand`) over adding a new package. A new dependency needs a stated reason and explicit approval.
*   Commit `package-lock.json` with `package.json`. Do not use `--force` or `--legacy-peer-deps`.

## 10. Git & Review Hygiene

*   **Commit messages:** Conventional Commits — `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`; imperative mood; subject <= 72 characters.
*   **One logical change per commit.** No drive-by reformatting, renames, or dependency bumps mixed into a feature.
*   Do not commit `dist/`, `node_modules/`, or scratch files.
*   Do not commit, push, or open PRs unless asked.
*   PR description states: what changed, why, how it was verified (§11), and any rule deviations confirmed under §0.

## 11. Definition of Done

A change is done only when:
1.  `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass.
2.  No new violation of any §1 directive; touched files are no worse against §13.
3.  No leftover `console.*`, commented-out code, or unowned TODOs.
4.  Any new storage shape has a version bump and migration; any new external input has a Zod schema.
5.  New or changed behaviour has tests (§4). UI changes were also exercised in the running app, or you state that they were not.
6.  Docs stay true: if you changed the domain model, commands, or structure, this file or `Heirarchy.md` is updated in the same change.

## 12. Working Agreement for AI Agents

*   Read the surrounding code before editing; match its idiom, density, and naming.
*   Make the smallest diff that solves the request. No speculative abstractions, no unrequested refactors.
*   Do not install tooling, add dependencies, or modify `tsconfig` / ESLint config unless asked. Recommend it instead.
*   Do not run destructive or state-changing package commands (`npm audit fix --force`, `rm -rf node_modules`, lockfile regeneration) without asking.
*   Report outcomes faithfully: failing checks are reported with their output; skipped verification is stated as skipped.

## 13. Known Gaps & Backlog (audited 2026-09-20)

Pre-existing; not blockers for unrelated work (§0). Highest value first.

1.  **Test coverage is thin.** Only `lib/calendar-*`, `lib/notes-*-storage.ts`, `lib/blob-utils.ts`, `lib/image-utils.ts`, `lib/media-worker-client.ts`, both hooks, `calendar-shared`, `location-hierarchy` and `LoginForm` are tested. `lib/notes-trace.ts`, `notes-tree.ts`/`NotesFileViewer` (tested), most other components, and the notes page/editor UI are at 0%; the notes workspace hook has behavioural (characterization) tests only.
5.  **Oversized files** (limits: components 150, hooks/lib 300): `pages/notes.tsx` 351, `pages/dashboard.tsx` 349, `notes/spatial-notes-editor.tsx` 313, `pages/index.tsx` 235, `calendar/calendar-event-list-card.tsx` 221, `app-sidebar.tsx` 183, `pages/onboarding.tsx` 172, `pages/privacy.tsx` 169, `pages/pricing.tsx` 163, `pages/documentation.tsx` 158, `workspace-shell.tsx` 156. (Marketing pages are large mostly from inline copy; extract it to data modules.)
7.  **No formatter** (mixed tabs/spaces, quotes, semicolons). Adopt Prettier + `.editorconfig` and reformat in one dedicated commit.
8.  **ESLint is not type-aware** (`recommended`, not `recommendedTypeChecked`); no import-order, `max-lines`, or `no-console` rules.
9.  **No route-level code splitting** (`App.tsx` eagerly imports Excalidraw/pdf.js pages).
11. **Zustand installed but unused.**
13. **`README.md` is the unmodified Vite template.** Replace with real project docs.
14. **Legacy plain CSS:** `App.css` (391 lines) and `pages/notes.css` (273 lines) should migrate to Tailwind utilities over time.
15. **Same-millisecond edits skip the linear autosave debounce.** `setLinearContent` keys the debounce on `Date.now()`; two edits in one millisecond share a timestamp, so the second does not re-arm the timer and the first edit's content is saved. Unreachable by typing; pinned by a comment in `use-notes-workspace.test.ts`. Fix by using a monotonic counter instead of the timestamp.
16. **Calendar dates parsed as UTC.** `calendar-views.ts` (`scopeEventsToView`) and `calendar-event-list-card.tsx` call `new Date("YYYY-MM-DD")`, which is UTC midnight. West of UTC (e.g. `America/New_York`) an event on the 1st is treated as the last day of the previous month, so it is filtered into the wrong month and labelled a day early. `pages/dashboard.tsx` already parses date keys correctly (`dateKeyToDate`); reuse that. New tests use mid-month dates so they pass in any timezone.
