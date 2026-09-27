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
*   **NO monolithic components.** `[ENFORCED]` by `max-lines` in `eslint.config.js`: a component file (`.tsx`) over **150 lines** must be split into single-responsibility sub-components; hooks, `lib/` modules and workers (`.ts`) over **300 lines** must be split by responsibility. shadcn primitives (`components/ui/`) and tests are exempt.
*   **NO inline side-effects.** `[ENFORCED]` All side effects live in `useEffect` (or event handlers) with complete dependency arrays. `react-hooks/exhaustive-deps` is never silenced with `eslint-disable`; the React Compiler-derived rules in `eslint-plugin-react-hooks` v7 are fixed, not disabled.
*   **NO prop drilling.** `[REQUIRED]` If a prop crosses more than 2 component levels, use composition (`children`), Context, or a Zustand store.
*   **NO array index as `key`.** `[REQUIRED]` Use a unique, stable ID.
*   **NO secrets, credentials, or user data in logs.** `[REQUIRED]` Never `console.*` a form's `values`, tokens, or note contents.

## 2. Architecture & System Boundaries

The app is **local-first**: it works with no server, and it reads its own notes with no server even when it has one. Persistence is IndexedDB (`idb`); `localStorage` holds only what the first paint needs before an async read could answer — a cache of the appearance preferences, the workspace-lock hint, which way the notes page is navigated, and which sync server this device uses — and never user content. Heavy work runs in a Web Worker.

There *is* a backend now, in `server/`, and it is optional in the strongest sense: a device with no server chosen never calls it (`VITE_API_URL` is only the default; Settings → Sync server picks another, `lib/api/server-url.ts`), and a device on one still opens the workspace from the passphrase alone. It is a row store that holds ciphertext it cannot read. `docs/backend.md` is the design and `server/CLAUDE.md` the rules for writing it; requests go through `src/lib/api/`, responses are Zod-validated, and no component calls `fetch`. The workspace hierarchy is a set of entity stores (`wings`, `flights`, `branches`, `nests`, `twigs`, `pebbles`) alongside the note stores, all keyed by UUID and carrying `createdAt` / `updatedAt` / `deletedAt`. One more store syncs beside them: `preferences`, a single row (`lib/preferences/preferences-model.ts`) holding the theme, accent, density, text size and the order of the nav and dashboard.

### 2.1 Layers and dependency direction
Imports flow **downward only**. A layer never imports from a layer above it. `[REQUIRED]`

| Layer | Path | Responsibility | May import from |
| --- | --- | --- | --- |
| Pages | `src/pages/<route>.tsx` | Route-level composition. Wire hooks to components. One page per route, exported as a named `XxxPage`. No business logic. | everything below |
| Feature components | `src/components/<feature>/` | Presentational components plus that feature's hooks and pure helpers (`calendar/`, `notes/`). | `ui/`, `hooks/`, `stores/`, `lib/` |
| Shared components | `src/components/*.tsx` | Cross-feature shell/nav/form components. | `ui/`, `hooks/`, `stores/`, `lib/` |
| UI primitives | `src/components/ui/` | shadcn-generated. See §8. | `lib/utils`, other `ui/` only |
| Shared hooks | `src/hooks/` | Hooks used by **more than one** feature. | `stores/`, `lib/` |
| Stores | `src/stores/` | Zustand stores for state shared across unrelated trees (§2.4). | `lib/` |
| Lib | `src/lib/` | Storage modules, worker clients, pure utilities. **No React imports.** | `lib/` only |
| Workers | `src/workers/` | Web Worker entry points. No DOM, no React. | `lib/` types only |

*   **Feature-specific hooks are co-located** in their feature folder (e.g. `components/notes/use-notes-workspace.ts`). Move a hook to `src/hooks/` only when a second feature needs it.
*   **Where a new file goes.** `[REQUIRED]` Nothing new lands loose at the root of `components/` or `lib/`; put it in the folder for what it is about, and start a folder when none fits.
    *   `components/`: `layout/` (page scaffolding every page shares), `shell/` (the workspace frame), `theme/`, `auth/`, `lock/`, `command-palette/`, and one folder per feature (`calendar/`, `board/`, `dashboard/`, `notes/`, `settings/`, `marketing/`, `onboarding/`). A feature that outgrows one folder splits by area, as `notes/` (`spatial/`, `linear/`, `location/`, `tree/`) and `settings/` (one folder per card) do; the hooks that tie the areas together stay at the feature's root.
    *   `lib/`: by domain. `crypto/` (ciphers, envelopes, KDF, sealed text), `db/` (the IndexedDB schema, upgrades, tombstones), `hierarchy/` (wings, flights, branches, nests, pebbles, share paths), `twigs/` (tasks, due times, board and calendar maths), `notes/`, `media/` (worker client and protocol, images, compression), `lock/`, `backup/`, `preferences/`, `account/`, `api/`, `keys/`, `push/`, `sync/`. Only app-wide helpers stay at the root (`utils.ts`, `toast.ts`, `reorder.ts`, `route-warmup.ts`, `service-worker.ts`).
    *   Inside `lib/`, imports within one domain are `./x`; across domains they are `../<domain>/x` (never `../..`).
*   Check: `grep -rnE 'from "@/(pages|components)' src/lib src/hooks` and `grep -rn 'from "@/pages' src/components`. Both must return nothing.

### 2.2 Presentational vs. logic
*   **Presentational components** are pure functions: props in, JSX out, local UI state only (toggle, hover, open/close).
*   **Custom hooks** own business logic, persistence calls, and data transformation. Non-trivial logic goes in a `useSomething.ts`-style hook or a pure function in `lib/`, never inline in JSX.
*   Pure functions (formatting, hierarchy math, parsing) live in `*-utils.ts` / `lib/` so they are testable without React.

### 2.3 Data access and persistence
*   Components **never** touch `indexedDB`, `localStorage`, `Worker`, or `fetch` directly. `[REQUIRED]` Go through a `lib/<domain>/*-storage.ts` module or a `lib/<domain>/*-client.ts` worker client (`lib/notes/notes-navigation.ts`, `lib/preferences/preferences-cache.ts`, `lib/api/server-url.ts` and `lib/lock/workspace-lock.ts`'s hint are the `localStorage` seams).
*   **IndexedDB schema changes** must bump `NOTES_DB_VERSION` (or the relevant version constant) and add a migration in the `upgrade` callback. Never edit a shipped store shape in place. `[REQUIRED]`
*   **Data read from storage is untrusted.** Validate with a Zod schema before use; do not trust a cast. `[REQUIRED]` Define the schema once in `lib/` and infer the type from it (`lib/hierarchy/entity-model.ts` → `Wing`, `Flight`, `Branch`, `Nest`; `lib/twigs/twig-model.ts` → `Twig`).
*   **Workers** are constructed via `new Worker(new URL("../workers/x.ts", import.meta.url), { type: "module" })` inside a `lib/<domain>/*-client.ts` file, so Vite bundles them (the URL is relative to that file). Move CPU-heavy work (image optimization, compression, PDF processing) off the main thread. The request/response contract lives once in `lib/media/media-worker-protocol.ts` (types only) and is imported by both the client and the worker; never redeclare it.
*   **Network access goes through `src/lib/api/`.** `[REQUIRED]` `client.ts` is the only place that calls `fetch`; every response is parsed with the schema `shared/` declares, because a server is trusted no more than a file is. Components consume it through a hook. TanStack Query is **not** installed; adding it needs approval.
*   **An account never gates reading.** `[REQUIRED]` The keys are on disk, sealed: `unlockAccount` opens the workspace from the passphrase with no network at all, and a failed session is not a failed sign-in. Anything that makes the notes unreadable when the server is unreachable is a bug.
*   **Every device has one local account, and the workspace waits for it.** `[REQUIRED]` It is a name, an email and a passphrase (`lib/account/local-account.ts`, made at `/auth/signup`); `RequireLocalAccount` sends a device without one there before any workspace page renders. The name and email are stored in the clear, so the lock screen can greet by name; the passphrase is the lock, and on a device with a sync account it is that account's passphrase too. `lib/account/device-account.ts` is the one place that decides which of the two a passphrase opens — unlock, verify and change through it, never through the lock or the account directly. The sync account is optional (`server-connect.ts` to join, `server-disconnect.ts` to leave or delete); leaving it moves every row this workspace owns back onto the lock, so no note depends on a server that is gone.
*   **A session token lives in memory and nowhere else.** `[REQUIRED]` `lib/api/session-store.ts` holds it; writing one to IndexedDB would leave a working credential on disk beside the ciphertext it is meant to be separate from.
*   **Every shareable object gets its own key, and only with an account.** `[REQUIRED]` `lib/keys/object-keys.ts` is the one place a key is minted; a storage module asks it for the cipher to write with and never reaches for `getActiveCipher()` itself. Reads pass no cipher at all, so the keyring resolves each row by the `keyId` it carries — a list can hold rows on several keys. With no account it all falls back to the active cipher, which is what keeps a purely local workspace unchanged.
*   **An optional callback never wraps the work.** `[REQUIRED]` Write `const x = await work(); on?.(x)`, never `on?.(await work())`: an optional call does not evaluate its arguments, so the work silently never happens when nobody is listening. This has bitten twice — the reminder sweep and the background sync.

### 2.4 State management
*   Default to local `useState` / `useReducer`. Prefer **derived state** over duplicated state.
*   **Shared mutable, non-rendering state** (timers, "latest value" mirrors, in-flight request ids) lives in one session hook that returns a stable bundle of refs (`notes/use-notes-session.ts`), which sibling hooks receive as a parameter. React Compiler's `react-hooks/immutability` rule only allows mutating a ref that arrived as an argument if it is a local whose name ends in `Ref`, so destructure at the top of the hook (`const { pendingEditRef } = refs`) and list those locals in dependency arrays.
*   **Derive, don't sync.** If a value can be computed from existing state, compute it; do not copy it into state from an effect (`react-hooks/set-state-in-effect` fails the build once the file is analysable).
*   Shared UI state: composition or Context first. Zustand only when state must be shared across unrelated trees; stores live in `src/stores/use-<name>-store.ts`. Keep global state minimal. There are two: `use-preferences-store.ts` (read by the sidebar, settings, the palette and every theme menu) and `use-command-palette-store.ts` (opened by a hotkey, the sidebar and the phone's "More" sheet). `src/test/setup.ts` resets both after every test; a new store is added there too.
*   **Preferences are written three places, in order.** `usePreferencesStore().update` sets the store, writes the `localStorage` cache (what the next first paint reads) and then the IndexedDB row (what syncs). `useApplyAppearance` (mounted once in `App`) puts them on `<html>`; `index.html`'s inline boot script does the same before any bundle loads, so it must stay in step with `applyPreferencesToDocument`. Read them through `useAppearance()`, never by passing `isDark` down.
*   **Drag and drop** is `@dnd-kit`. Keep the "what was dropped where" arithmetic in a pure `lib/` function (`board.ts`, `calendar-drop.ts`) and let the hook do the writing: jsdom reports every element as zero-sized, so the mapping is only testable away from the DOM. Pointer drags belong in the E2E suite; the keyboard path (`KeyboardSensor`) works in jsdom and is covered there.

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
    *   Group order, `[ENFORCED]` by `simple-import-sort` (`npm run lint -- --fix` reorders): packages (`react` first), then `@/…`, then `./…`, then side-effect/style imports. Side-effect imports come last and keep their written order, because CSS order is the cascade. `src/main.tsx` is exempt: the global stylesheet (`./index.css`) must load before `App`, and therefore before any page stylesheet.
*   **Exports:** named exports only, except `App.tsx`.
*   **Comments:** explain *why*, not *what*. No commented-out code. TODOs need an owner or issue: `// TODO(name): …`.
*   **Logging:** no `console.*` in committed code except the sanctioned `lib/notes/notes-trace.ts` tracer. `[ENFORCED]` by `no-console`.
*   **Formatting:** Prettier (`.prettierrc.json`) and `.editorconfig`: 2-space indent, double quotes, semicolons, print width 100. `[REQUIRED]` Run `npm run format` before committing; `npm run format:check` must pass. Prettier is not part of lint or the build, so nothing fails automatically. `src/components/ui` (regenerated by the shadcn CLI), markdown, CSS and HTML are deliberately excluded (`.prettierignore`).
    *   The one-off reformat commit is listed in `.git-blame-ignore-revs`; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` so `git blame` skips it.
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
*   **Timezone** `[ENFORCED]`: `vitest.global-setup.ts` pins every test run to `America/New_York`, a zone west of UTC, so date bugs (e.g. `new Date("YYYY-MM-DD")`, which is UTC and lands on the previous day) fail on any machine. Parse date keys with `dateKeyToDate()` from `calendar-shared.ts`, never `new Date(key)`.
*   **Isolation** `[ENFORCED]`: the setup file runs an MSW server that fails any network request without a handler (`data:` and `blob:` URLs are in-memory and exempt); add handlers with `server.use(...)` from `src/test/server.ts`. IndexedDB is `fake-indexeddb` (auto-installed); `localStorage`, the `<html>` class and its `data-*` attributes, and the Zustand stores are reset after every test; `ResizeObserver` and `scrollIntoView` are stubbed (jsdom has neither; cmdk needs both). Stub `window.matchMedia` per test where needed (jsdom has none).
*   **Coverage** `[ENFORCED]` by `npm run test:coverage` (thresholds in `vite.config.ts`, deliberately just under what is measured so it can only go up): overall lines/statements 97.5%, functions 96%, branches 93%; `src/hooks/**` 100%; feature hooks (`src/components/**/use-*.ts`) 97% lines / 88% branches; `src/lib/**` 97% lines / 99% functions / 93% branches; `src/workers/**` 100% lines / 90% branches; `server/**` 99% lines / 96% branches. Pure utilities in `lib/` and `*-utils.ts` should reach 100% of their logic `[REQUIRED]`. Raise a threshold whenever coverage improves. The text reporter hides fully covered files, so read totals from `--coverage.reporter=json-summary` if a file seems missing.
*   Suites that need real streams or no DOM (the Web Worker) opt into Node with a `// @vitest-environment node` first line; the shared setup is safe in both environments.
*   **Browser-level tests (Playwright)** `[REQUIRED]` live in `e2e/*.spec.ts` and cover only what jsdom cannot: the real Excalidraw canvas, real pdf.js, drag-and-drop, fullscreen, and cross-page flows. Do not re-test routing, forms or filters there; those belong in Vitest. Specs run against a production build served by `vite preview` (`playwright.config.ts` builds it), each in a fresh browser context so IndexedDB and `localStorage` start empty. Every test also fails on any uncaught page error or `console.error` (`e2e/fixtures.ts`), and each spec was checked by breaking the behavior it covers.
    *   Drive Excalidraw like a user: its tool buttons are radio inputs behind a label, so click the label; choosing a tool opens a properties panel over the left of the canvas, so start strokes right of centre. Measure the canvas with `inkPixels()`, not with selectors.
    *   `window.prompt` (the PDF page picker) is auto-dismissed unless a `dialog` handler is registered first, which would make an import test pass vacuously: always register one.
    *   **Visual regression** is a separate project (`npm run test:visual`). Baselines are not committed because font rendering differs between machines: run `npm run test:visual -- --update-snapshots` before a UI change, then `npm run test:visual` after; any pixel difference fails. Baselines live in `e2e/__visual__` (git-ignored).
*   MSW's postinstall (browser service worker) is blocked by npm's install-scripts policy. It is only needed for in-browser mocking, not for these Node tests; do not approve it unless browser mocking is introduced.

## 5. Performance & Security

*   **Memoization:** do not prematurely optimize. `useMemo` / `useCallback` only for expensive calculations or when passing props to memoized/deeply nested children.
*   **Validation:** validate all form inputs and all external data with **Zod** at the boundary. `[REQUIRED]`
    *   Forms: React Hook Form + `@hookform/resolvers/zod` (see `login-form.tsx`, `signup-form.tsx`).
    *   Also validate: data read from IndexedDB/`localStorage`, worker messages, imported files.
*   **XSS / code execution:** no `dangerouslySetInnerHTML`, `eval`, or `new Function`. Rich text goes through TipTap's schema. `[REQUIRED]` (`grep -rnE 'dangerouslySetInnerHTML|\beval\(|new Function' src` → nothing.)
*   **Secrets:** never commit secrets. Anything in `import.meta.env.VITE_*` is public in the bundle; do not put credentials there.
*   **Encryption goes through the cipher seam** (`lib/crypto/cipher.ts`). `[REQUIRED]` Storage modules ask for the active cipher and run their payload through it; they never branch on whether encryption is on. Every document row records which cipher wrote it, so a database can hold a mix and nothing has to be rewritten at once. Two rules when touching it:
    *   **Seal before opening an IndexedDB transaction, never inside one.** Awaiting anything that is not an IDB request lets the transaction auto-commit, and the puts after it fail with `TransactionInactiveError` in a real browser (fake-indexeddb is lenient and will not catch this).
    *   **An encrypted row that cannot be read is an error, not a fallback.** Returning the raw bytes would hand the editor ciphertext and autosave would write it back as the note.
*   **Crypto is AES-GCM from WebCrypto, under a key derived by Argon2id** (`hash-wasm`, the one crypto dependency — WebCrypto has no Argon2). The KDF's name and parameters travel inside every envelope and inside the lock record (`lib/crypto/kdf.ts`), so a workspace locked under PBKDF2 still opens with it and raising a cost is a new value rather than a migration. New key material is always Argon2id. Say "encrypted on this device"; the key is in JS memory while the data is readable and the code using it is served from the same origin, so it protects a file that leaves the device and a copied profile directory, not a compromised bundle or an XSS bug.
*   **A server's key-derivation parameters are held to a floor.** `[REQUIRED]` Signing in derives a proof from parameters the server supplies and sends it back, so a hostile server could ask for a trivial cost and brute-force the passphrase — which also opens the device. `assertAccountKdf` (`lib/crypto/kdf.ts`, bounds in `shared/kdf-params.ts`) runs before any account derivation and fails as `untrusted-server`; parameters read from a backup file are held to the ceiling only. A sync server is reached over https, or plain http to localhost only (`lib/api/server-url.ts`).
*   **A path resolves as far as it can, and never further.** `[REQUIRED]` `branchPath` is
    deliberately not all-or-nothing: a course shared with you has no readable term or wing,
    and dropping its own name along with them would lose the one thing that *is* readable.
    Say `SHARED_SEGMENT_LABEL` where a name cannot be read; never invent one, and never
    show a blank where the reason is knowable.
*   **The lock covers content and names, and deliberately not dates.** `lib/crypto/sealed-text.ts` is the seam for the one display field a row is listed by (`feather`, `name`, `title`); `lib/crypto/cipher.ts` is the seam for payloads. A twig's `dueDate`, `dueTime`, `status` and every timestamp stay in the clear on purpose, so a future server holding nothing but ciphertext can still drive a reminder. `[REQUIRED]` Storage modules seal on write and open on read: a row leaves `lib/<domain>/*-storage.ts` in plaintext and with no `encryption` marker, and a row that cannot be opened is an error, never its ciphertext.
*   **Vite assets:** import static assets (images, SVGs) through Vite's module system; do not reference `public/` paths directly from components. The exception is what the browser fetches by URL rather than the bundler: `manifest.webmanifest`, `sw.js` and the PWA icons live in `public/` and are referenced from `index.html`.
*   **The service worker (`public/sw.js`) is hand-written and takes no build step.** `[REQUIRED]` It needs no precache manifest because everything under `/assets/` is content-hashed (cached forever, served cache-first) while the HTML document is not (network-first, so a deploy is picked up). Do not add `vite-plugin-pwa` to replace it without a reason; it would be a new dependency for something that already works. Registration goes through `lib/service-worker.ts`, production only — in dev a cache would serve yesterday's modules back after an edit.
*   **Bundle weight:** every route except the landing page is loaded on demand through `lazyPage()` in `App.tsx`, which keeps the entry chunk at ~237 kB instead of ~2.1 MB. New pages must be added the same way; do not import a page eagerly into `App.tsx`. `[REQUIRED]`
*   **Untrusted files:** user-supplied PDFs/images are untrusted input; process them in the worker where possible.

## 6. Common Commands
| Purpose | Command | Notes |
| --- | --- | --- |
| Dev server | `npm run dev` | |
| Typecheck | `npm run typecheck` | `tsc -b`. The root `tsconfig.json` is solution-style, so build mode (`-b`) is required; a bare `tsc --noEmit` checks zero files. |
| Lint | `npm run lint` | `eslint .`; **type-aware** (`recommendedTypeChecked`), so it needs the tsconfigs and takes a few seconds. |
| Format | `npm run format` / `npm run format:check` | Prettier. `format:check` is the CI-style gate. |
| E2E | `npm run test:e2e` | Playwright against a production build; first run on a machine needs `npx playwright install chromium`. |
| Visual | `npm run test:visual` | Local pixel comparison; see §4. |
| Build | `npm run build` | `tsc -b && vite build` |
| Build the server | `npm run build:server` | Bundles `server/src/main.ts`; Node cannot resolve `./app` or `@shared/…` on its own. |
| Run the server | `npm run start:server` | Needs `DATABASE_URL` and `SERVER_SECRET`; see `server/CLAUDE.md` §5. |
| Server + Postgres in Docker | `docker compose up --build` | Needs `POSTGRES_PASSWORD` and `SERVER_SECRET` in a git-ignored `.env`; see `docs/backend.md` ("Running it"). |
| Test | `npm run test` | Vitest; see §4. |

*   **Before reporting completion run:** `npm run format:check && npm run typecheck && npm run lint && npm run test && npm run build`. All pass on a clean tree today; keep them clean.
*   Node **>= 22.13** is required (`pdfjs-dist` v6), declared in `package.json` `engines`.
*   **CI runs all of it.** `.github/workflows/ci.yml` runs the same gates on every push and pull request, on the Node floor above, installing with `npm ci --ignore-scripts` so msw's postinstall stays blocked as it is locally (§4). The `visual` project is deliberately not run there: its baselines are not committed because font rendering differs between machines. A failing browser run uploads its Playwright report as an artifact.

## 7. Domain Model

The data hierarchy is defined in `docs/hierarchy.md`. That file is the source of truth; if code and doc diverge, update the doc in the same change.

| Term | Meaning | Notes |
| --- | --- | --- |
| **Wing** | Workspace / profile | A user can belong to many wings but owns exactly one. |
| **Flight** | Academic term / semester | Sorted by date into Summer / Fall / Spring + year. |
| **Branch** | Course / class | |
| **Nest** | Tag | Marks units, or homework type (projects, units, …). Belongs to a Branch; a note, twig or pebble carries a list of them, and the path bar navigates by one as if it were a level. |
| **Twig** | Task | Homework, exams, essays. |
| **Feather** | Note | JSON document for a class. |
| **Pebble** | File | PDFs, images, other data. |

*   **Use this vocabulary in identifiers** (types, functions, storage keys). Do not introduce synonyms (`course`, `semester`, `workspace`, `tag`) for these concepts in code. UI copy may use plain-language labels.
*   Each term above is a record in its own store, with an id of its own, so any of them can be renamed without touching what points at it. `lib/hierarchy/workspace-tree.ts` resolves ids to the names the UI shows; `NotesHierarchyLocation` is that display projection, not storage. Extend those rather than creating parallel shapes.

## 8. UI System (shadcn/ui + Tailwind v4)

*   **`src/components/ui/**` is generated code.** Add or update primitives with the shadcn CLI (`npx shadcn@latest add <name>`, config in `components.json`, style `base-nova`). Do not hand-edit them for feature needs; wrap or compose them instead. (ESLint intentionally relaxes `react-refresh/only-export-components` there.) Generated files are exempt from the size and index-key rules (`ui/field.tsx` keys an error list by index). `[REQUIRED]`
*   **Tailwind v4 is CSS-first:** configuration lives in `src/index.css` (`@theme inline`, `@custom-variant dark`). There is no `tailwind.config.js`; do not add one.
*   **Class composition:** use `cn()` from `@/lib/utils` to merge classes; use `cva` for variant-driven components.
*   **Use design tokens** (`bg-background`, `text-muted-foreground`, `border-border`, …). No hard-coded hex colours or arbitrary colour values in components. Dark mode goes through the token system.
*   **No inline `style={{}}`** except for dynamically computed positioning/sizing values.
*   **Plain CSS:** none, except `pages/notes.css`, which holds the Excalidraw branding overrides (third-party markup that cannot take utility classes). Do not add new global CSS files.
*   **Theming is four attributes on `<html>`.** `data-theme` (`light` / `paper` / `dark` / `oled`, plus the `.dark` class for `dark:` utilities), `data-accent` (eight hues), `data-density` (scales Tailwind's `--spacing`, so every gap and padding) and `data-font-size` (the root size). A component never branches on them: it uses tokens. The accent is `--brand-h` / `--brand-c` from the accent and `--brand-l` from the theme; those numbers are mirrored in `lib/preferences/accent-palettes.ts`, where `color-contrast.test.ts` checks every pair against WCAG AA and `e2e/appearance.spec.ts` checks the stylesheet still agrees. Change both or neither.
*   **Type scale.** Headings and body text use `text-display`, `text-title`, `text-heading`, `text-body` and `text-caption` (declared in `@theme`), not ad-hoc sizes. `cn()` is taught these names (`lib/utils.ts`), so they survive a merge with a text colour; a new size added to `@theme` is added there too. Base element rules live in `@layer base`, so utilities win without `!`.
*   **Page layout.** Every workspace page is `PageContainer` + `PageHeader` (title, description, optional eyebrow and actions) and renders inside `WorkspaceLayout`, the layout route in `App.tsx` that keeps the shell mounted between pages. An empty list uses `EmptyState`; a small set of views uses `SegmentedControl`. Transient confirmations go through `lib/toast.ts`; anything someone must act on stays on the page.
*   **The entry chunk stays lean.** The landing page is eager, so anything it renders is in the entry chunk. The theme menu and the marketing mobile menu load their dropdown on demand (a disabled look-alike button stands in until then), and the toaster, the sync client and the preferences' IndexedDB layer are dynamic imports. Check `npm run build`'s `index-*.js` size after touching `App`, the landing page or the stores.
*   **Icons:** `lucide-react` for UI icons; brand marks go through `components/layout/brand-icon.tsx`.
*   **Forms:** React Hook Form + Zod + the `Field` primitives; do not hand-roll form state.
*   **Dates:** use `date-fns`. Do not add a second date library.

## 9. Dependencies

*   **Never run `npm audit fix --force`.** It downgrades `@excalidraw/excalidraw` to 0.17.6 (removing the `/types` and `index.css` subpaths `src/` imports) and bumps `pdfjs-dist` a major; Vite then fails to boot. `[REQUIRED]`
*   Remaining audit advisories in the Excalidraw chain (`lodash-es`, `nanoid`, `@mermaid-js/parser`) are handled by the scoped `overrides` block in `package.json`. Extend that block; do not remove it.
*   Pinned constraints: `@excalidraw/excalidraw` stays on `^0.18`; `pdfjs-dist` stays on v6 (fixes a high-severity malicious-PDF advisory; `destroy()` is on the loading task, not `PDFDocumentProxy`).
*   **`brotli-wasm`** is there because no browser exposes Brotli through `CompressionStream`. Its ESM entry loads the `.wasm` by fetching a URL relative to the module, which Vite rewrites but Node cannot resolve for a `file:` URL — so `vite.config.ts` aliases the package to its own Node build **for tests only**. Keep that alias if the package is upgraded. The WASM is behind a dynamic `import()` in `lib/media/text-compression.ts`, so it is fetched on the first save and never on a path that does not compress.
*   After **any** dependency change run `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm audit`; also confirm `npm ls @excalidraw/excalidraw pdfjs-dist nanoid lodash-es` still shows the pinned versions.
*   Playwright downloads its own browser to `~/.cache/ms-playwright` (`npx playwright install chromium`); the browser revision is tied to the `@playwright/test` version, so re-run that command after upgrading it.
*   `ws` is there for the live channel's server side and nothing else: `@hono/node-server` does the WebSocket upgrade but needs a server implementation to hand it to. The browser uses its own `WebSocket`; tests replace the global with an inert one (`src/test/setup.ts`), so no test opens a real socket except `server/src/live.test.ts`, which does so on purpose.
*   `hash-wasm` is there for Argon2id and nothing else: it carries its WASM inline, so unlike `brotli-wasm` it needs no Vite alias and no fetch at runtime.
*   `cmdk` is there for the command palette (`components/ui/command.tsx`) and `sonner` for toasts (`components/shell/toaster.tsx`, `lib/toast.ts`). Neither goes in the entry chunk.
*   Prefer what is already installed (`date-fns`, `zod`, `lucide-react`, `@dnd-kit`, `zustand`, `hash-wasm`, `cmdk`, `sonner`) over adding a new package. A new dependency needs a stated reason and explicit approval.
*   Commit `package-lock.json` with `package.json`. Do not use `--force` or `--legacy-peer-deps`.

## 10. Git & Review Hygiene

*   **Commit messages:** Conventional Commits — `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`; imperative mood; subject <= 72 characters.
*   **One logical change per commit.** No drive-by reformatting, renames, or dependency bumps mixed into a feature.
*   Do not commit `dist/`, `node_modules/`, or scratch files.
*   Do not commit, push, or open PRs unless asked.
*   PR description states: what changed, why, how it was verified (§11), and any rule deviations confirmed under §0.

## 11. Definition of Done

A change is done only when:
1.  `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass.
2.  No new violation of any §1 directive; touched files are no worse against §13.
3.  No leftover `console.*`, commented-out code, or unowned TODOs.
4.  Any new storage shape has a version bump and migration; any new external input has a Zod schema.
5.  New or changed behaviour has tests (§4). If you changed the notes canvas, PDF import, image drop, fullscreen or a page flow, `npm run test:e2e` passes too. UI changes were also exercised in the running app, or you state that they were not.
6.  Docs stay true: if you changed the domain model, commands, or structure, this file or `docs/hierarchy.md` is updated in the same change.

## 12. Working Agreement for AI Agents

*   Read the surrounding code before editing; match its idiom, density, and naming.
*   Make the smallest diff that solves the request. No speculative abstractions, no unrequested refactors.
*   Do not install tooling, add dependencies, or modify `tsconfig` / ESLint config unless asked. Recommend it instead.
*   Do not run destructive or state-changing package commands (`npm audit fix --force`, `rm -rf node_modules`, lockfile regeneration) without asking.
*   Report outcomes faithfully: failing checks are reported with their output; skipped verification is stated as skipped.

## 13. Known Gaps & Backlog (audited 2026-09-27)

Pre-existing; not blockers for unrelated work (§0). `docs/backend.md` ("What is still missing")
has the server-side list and the reasoning; this is the short form for someone editing the code. Everything buildable
without a server has shipped, so what is left here is inherent or waiting on the backend.

1.  **Tombstone collection only runs when the workspace is opened.**
    `collectTombstonesOnce` runs from `WorkspaceShell` when the workspace is usable, so
    one nobody opens never sweeps. The ninety-day window is what a merge-style restore can
    see back: merging a file older than that can bring a deleted note back, because the
    marker that said "deleted here" is gone.
2.  **Route warm-up is best-effort.** `lib/route-warmup.ts` imports the unvisited page
    chunks on idle so the service worker caches them, workspace routes first. A first
    visit closed before it goes idle still leaves routes that will not open offline.
3.  **A merge restore is last-write-wins and nothing more.** Sync merges two edits of one
    row against the version both started from (`lib/sync/reconcile.ts`) — by paragraph,
    then by word, by shape, or by field; restoring a backup file still keeps the later
    `updatedAt` whole. Two people changing the same words still leave one version.
4.  **Live updates are one process wide.** `server/src/live.ts` keeps the WebSocket hub in
    memory, so a second server process needs it on a shared channel (Postgres
    `LISTEN/NOTIFY`) before its devices hear each other's writes. A missed nudge costs a
    minute until the periodic sync, never data.
5.  **A rotated key's old grants stay.** `lib/keys/rotate-shared.ts` rotates a shared key on
    a revoke and once it is ninety days old, and moves every row onto the new one, but it
    leaves the grants on the old key in place rather than revoking them.
