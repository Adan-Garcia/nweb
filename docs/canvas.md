# The canvas

Written 2026-09-30. This is a design: nothing in it is built. It describes how to replace
Excalidraw with a canvas of our own, what Apple Pencil support means in a browser and what
it takes beyond one, and what changes when the app also ships as a Tauri app. The canvas
does not depend on Tauri, and Tauri does not depend on the canvas.

## Decisions

Settled on 2026-09-30:

1.  **Stroke outlines use `perfect-freehand`** (MIT, no dependencies) rather than code of
    our own.
2.  **The first release has shape tools** (rectangle, ellipse, straight line) beside the
    pen. Arrows, connectors and Excalidraw's other tools are dropped. Shape recognition
    comes later and produces the same shape elements.
3.  **Tauri ships everywhere it runs:** Windows, macOS and Linux desktop, iOS and iPadOS,
    and Android.
4.  **Reminders under Tauri are remote push**, sent by the server through APNs and FCM,
    not only notifications scheduled on the device.
5.  **No existing notes are carried over.** Nobody has notes yet, so there is no converter
    from Excalidraw's format and no version-guard release ahead of the switch. Excalidraw
    is removed in the same change that brings the new canvas in.

## Why replace Excalidraw

The notes are becoming handwriting-first: pressure, smoothing, palm rejection, and later
OCR, shape recognition and math recognition over the strokes. Excalidraw is a diagramming
tool, and the app has no hold on its ink:

*   `use-excalidraw-pen.ts` only mirrors the toolbar's width slider into
    `currentItemStrokeWidth`. Pressure, smoothing and stroke shape are Excalidraw's, and
    cannot be tuned.
*   Recognition wants the raw samples (position, pressure, tilt, time). Excalidraw keeps
    points and a pressure array, but not tilt or timing, and its element model is not ours
    to extend.
*   It is the heaviest dependency in the app, and the reason for the `overrides` block in
    `package.json` (`lodash-es`, `nanoid`, `@mermaid-js/parser`).

## What must not change

The rest of the app already assumes four things about a drawing. The new format keeps all
four, which is what keeps `src/lib/` almost untouched.

1.  **Every element has an `id` and a `version`, bumped on every change.**
    `lib/sync/merge-scene.ts` merges two edits element by element by comparing versions
    with the base.
2.  **Every element has a fractional `index`** (a string that sorts into stacking order).
    The merge uses it to order the result.
3.  **A deleted element is absent, not flagged.** The merge reads "missing on one side and
    unchanged on the other" as a delete.
4.  **A dropped image's id is derived from its contents.** `notes-document-storage.ts`,
    `notes-delete.ts` and `entity-delete.ts` count references by id before deleting bytes,
    because one picture dropped into two notes is one row. The new canvas takes a SHA-256
    of the file's bytes (WebCrypto), so the same picture always gets the same id. PDF pages
    keep their random ids, as today.

The storage row does not change either: the scene is still one JSON string, compressed
(`sceneCompressed`, `sceneCompressionAlgorithm`) and sealed through the cipher seam, with
its files listed in `sceneFiles`. So there is no IndexedDB version bump. What changes is
what is inside the string.

## Scope

**First release (replaces Excalidraw):**

*   Pen with pressure and smoothing, highlighter, stroke eraser, lasso select (move,
    delete, recolour), a small colour set and the width slider.
*   Shapes: rectangle, ellipse and straight line, drawn by drag, with a stroke colour, a
    width and an optional fill. Selected with the lasso like strokes; moved and deleted,
    and resized by corner handles.
*   Pan and zoom by two fingers, trackpad and wheel; infinite in every direction.
*   Undo and redo.
*   Images (drop and paste) and PDF pages, with the page picker as it is today.
*   Fullscreen, autosave, sync merge and backup, as today.
*   Export of a note to PNG and PDF.

**Later, in this order:** text boxes; shape recognition (a hand-drawn box or circle
straightened into the shape elements above); a pixel eraser that splits strokes; ruled
and grid backgrounds; recognition (OCR, math, vocabulary).

Arrows, connectors, diamonds, libraries, collaboration cursors and Mermaid import are
dropped.

## The scene format

Declared once, as a Zod schema in `lib/canvas/scene-model.ts`, with the TypeScript types
inferred from it.

```ts
type Scene = {
  format: 1;                       // bumped when the shape of an element changes
  elements: SceneElement[];
  view?: { x: number; y: number; zoom: number }; // this device's; never merged
};

type ElementBase = {
  id: string;        // UUID
  version: number;   // +1 on every change
  index: string;     // fractional stacking key
  x: number;         // origin in scene units
  y: number;
  locked?: boolean;
};

type Stroke = ElementBase & {
  type: "stroke";
  tool: "pen" | "highlighter";
  color: string;     // a palette token name, not a hex (theme-aware)
  width: number;     // base width; pressure scales it
  // Flat, relative to (x, y): [dx, dy, pressure, tiltX, tiltY, dt] repeated.
  // Tilt and time are kept for recognition and shading, not only for drawing.
  samples: number[];
};

type Shape = ElementBase & {
  type: "shape";
  kind: "rectangle" | "ellipse" | "line";
  width: number;     // bounding box; for a line, the vector from (x, y) to its end
  height: number;
  rotation: number;  // radians about the centre
  color: string;     // palette token, as for strokes
  strokeWidth: number;
  fill: string | null;
};

type ImageElement = ElementBase & {
  type: "image";
  fileId: string;    // content hash, or a random id for a PDF page
  width: number;
  height: number;
};

```

Samples are a flat number array because a note is thousands of strokes of hundreds of
points; objects per point would triple the stored size before compression. Coordinates are
rounded to two decimals and pressure and tilt to three before saving.

`lib/sync/merge-scene.ts` keeps working because it only reads `id`, `version` and `index`;
its comments stop naming Excalidraw, and the whole-scene key it copies from the local side
becomes `view` instead of `appState`.

A scene that does not parse, including one with a `format` above what the app knows, is an
error shown on the note, read-only and never autosaved, following CLAUDE.md's rule that a
row that cannot be read is an error and not a fallback. That is also the whole of the
version handling: a future format change adds its own upgrade step when there are notes
to upgrade.

The spatial-note rows already in a development database hold Excalidraw's JSON. They fail
that parse and show as unreadable; delete them rather than write a converter for them.

## The input pipeline

```
PointerEvent ─▶ filter ─▶ sampler ─▶ smoother ─▶ outline ─▶ live layer
                                                     └──▶ on pointerup: commit to scene
```

*   **Filter** (`lib/canvas/input-filter.ts`, pure). Decides which pointer draws:
    *   While a pen is down or hovering, touch pointers are ignored (palm rejection).
    *   One finger draws only when "draw with finger" is on (off by default on a device
        that has reported a pen); otherwise one finger pans.
    *   Two fingers are always pan and pinch-zoom, and cancel a stroke started in the
        last ~100 ms (a pinch often lands one finger first).
    *   A mouse draws with the left button and pans with the middle.
*   **Sampler.** Reads `getCoalescedEvents()` where it exists (feature-detected; it is
    not in every Safari) so a fast stroke keeps every sample the hardware delivered, not
    just one per frame.
*   **Smoother** (`lib/canvas/stroke-geometry.ts`, pure). A one-euro filter on position,
    and a short moving average on pressure, both with the strength exposed as a setting.
    The raw samples are what is stored; smoothing is applied again at render time, so the
    setting can change without rewriting notes.
*   **Outline.** Pressure → width along the path, with tapered ends, producing a closed
    polygon filled in one call. This is `perfect-freehand`'s `getStroke`, called from
    `stroke-geometry.ts` only, so the rest of the canvas never imports it. Its own
    smoothing and streamline options stay off: the smoother above has already run, and
    two smoothers in a row lag the pen.
*   **Live layer.** The stroke being drawn is on its own `<canvas>` above the scene and
    redraws only itself each frame, so latency does not grow with the note.

### Rendering

Canvas 2D, in two layers (scene and live), device-pixel-ratio aware.

*   A spatial index (`lib/canvas/spatial-index.ts`, a grid of buckets) so drawing and hit
    testing only look at elements near the viewport or the eraser.
*   Each committed stroke caches its `Path2D` outline; the scene layer redraws on pan and
    zoom from those, and a still view is not redrawn.
*   PDF pages and images are decoded once into `ImageBitmap`s and drawn at the resolution
    the zoom needs.

Canvas 2D is enough for thousands of strokes. WebGL is the fallback if a real note proves
otherwise; the renderer sits behind one function so that swap would be local.

## Apple Pencil in the browser

What Safari on iPad gives a web page, and what it does not:

| Available to the web app | Only to native code |
| --- | --- |
| `pointerType: "pen"`, `pressure` | Double-tap (Pencil 2, Pencil Pro) |
| `tiltX` / `tiltY` (and `altitudeAngle` / `azimuthAngle` where present) | Squeeze (Pencil Pro) |
| Hover: `pointermove` with no buttons, on iPads that support Pencil hover | Barrel roll (Pencil Pro) |
| Coalesced events, where supported | Haptic feedback (Pencil Pro) |
| Palm rejection, done by the filter above | PencilKit's own predicted, low-latency ink |

Hover is used for a cursor preview of the brush size and colour. Tilt widens the
highlighter and is kept in the samples for later shading.

iPad-specific details that are small but required on the canvas element:

*   `touch-action: none`, or Safari scrolls and zooms the page instead of drawing.
*   `-webkit-user-select: none` and `-webkit-touch-callout: none`, or a long press shows
    the magnifier and selects text.
*   `preventDefault` on `pointerdown` from a pen, so Scribble does not try to turn the
    stroke into typed text over an input.

None of this can be checked in jsdom. It is checked by hand on an iPad (see "Testing").

## Tauri

Tauri 2 wraps the same built web app in the platform's own webview: WKWebView on iOS and
macOS, WebView2 on Windows, WebKitGTK on Linux, the system WebView on Android. The React
app, IndexedDB, WebCrypto and the WASM (Argon2, Brotli) all run unchanged. What Tauri adds
is a native shell around them and a way to call native code (plugins, written in Rust, and
in Swift or Kotlin on mobile).

For this app the reason to do it is the iPad: it is the only way to reach the right-hand
column of the Pencil table above.

### What changes in the app

| Area | Today | Under Tauri |
| --- | --- | --- |
| Offline start | `public/sw.js` caches the build. | Not needed: the build ships inside the app. `registerServiceWorker` returns early when running in Tauri (WKWebView does not run service workers on Tauri's custom scheme). |
| Origin | The page's `https://` origin. | `tauri://localhost` (Apple) or `http://tauri.localhost` (Windows, Android). The server's `allowedOrigins` (`server/src/app.ts`) must list them, or every sync request fails CORS. |
| Sync server choice | Settings → Sync server, default `VITE_API_URL`. | Unchanged. There is no page origin to fall back to, so a Tauri build must always have a server set or run local-only. |
| Reminders | Web Push through the service worker (`lib/push/`). | No Web Push in a native webview. Remote push through APNs and FCM instead; see "Remote push". |
| Updates | A deploy is picked up on the next load. | A new build per release: App Store review on iOS, the updater plugin on desktop. Old versions live longer, so once people have notes a scene-format change needs an upgrade step, and the unknown-format refusal above keeps an old build from overwriting a newer note. |
| Storage | IndexedDB in the browser profile; Safari may evict it for a site not added to the home screen. | IndexedDB in the app's own container, kept until the app is deleted. A durability win. |
| "Keep me signed in" | Non-extractable keys in IndexedDB. | Unchanged. The Keychain is possible later through a plugin but not needed. |
| Security policy | The server's headers. | A CSP in `tauri.conf.json`; it must allow `wasm-unsafe-eval` (Argon2 and Brotli) and `connect-src` to the chosen sync server. |
| File import | `<input type="file">` and drag and drop. | Both still work. The dialog and filesystem plugins are optional. |

The detection is one function, `lib/platform/is-tauri.ts`, reading `window.__TAURI_INTERNALS__`
(what `@tauri-apps/api` checks). Nothing else branches on the platform; each seam that
differs (`service-worker.ts`, `push/`, and the Pencil bridge below) asks it.

### The Pencil plugin

The Pencil half of our own plugin, `tauri-plugin-native` (its other half registers for push;
see "Remote push"). The Pencil half is Swift for iOS and does nothing on every other
platform. It attaches to the webview and forwards what the web cannot see:

| Feature | Native API | Needs |
| --- | --- | --- |
| Double-tap | `UIPencilInteraction` delegate, `pencilInteractionDidTap` (or the tap variant on newer iOS) | Pencil 2 or Pro. Reads the user's system preference (`UIPencilInteraction.preferredTapAction`): switch to eraser, switch to last tool, show palette, or nothing. |
| Squeeze | `UIPencilInteraction` squeeze delegate | Pencil Pro, iOS 17.5+. Opens the tool palette at the Pencil's hover position. |
| Barrel roll | `UITouch.rollAngle`, read by a gesture recognizer on the webview that observes touches without cancelling them | Pencil Pro, iOS 17.5+. Sent as a stream keyed by timestamp; the sampler joins it to pointer samples by time, and it becomes the angle of a chisel highlighter. |
| Haptics | `UICanvasFeedbackGenerator` | Pencil Pro, iOS 17.5+. A tick when the lasso closes and when a shape snaps. |

The JavaScript side is `lib/pencil/pencil-bridge.ts`: one small event interface
(`onTap`, `onSqueeze`, `onRoll`, `haptic`) whose web implementation does nothing and whose
Tauri implementation listens to the plugin's events. The canvas uses only that interface,
so the web build and the iPad build run the same canvas code, and the extra features simply
appear on the iPad.

Roll arrives on a different channel from the pointer events, so a sample can miss it; a
stroke without roll data uses the last angle seen, which is what the eye expects.

PencilKit itself (`PKCanvasView`) is deliberately not used. It would give Apple's ink
engine, but the strokes would live in Apple's format on an iPad only, not in the synced,
sealed scene every device reads.

### Remote push

Today the server's reminder sweep (`server/src/reminders.ts`) sends a Web Push to every
subscription in `push_subscriptions`, and the payload says how many things are due and
when, never what. Native apps cannot receive Web Push, so the server gains two more
senders beside it, and the sweep sends to whichever kind of target each device registered.

| Platform | Service | Target the device registers |
| --- | --- | --- |
| Browsers (as today) | Web Push (VAPID) | endpoint + `p256dh` + `auth` |
| iOS, iPadOS, macOS | APNs | device token |
| Android | FCM | registration token |
| Windows, Linux | none in the first cut | local notifications, below |

**Server.**

*   A new table, `native_push_targets (user_id, platform, token, created_at)`, primary key
    `(user_id, token)`, created with `if not exists` beside `push_subscriptions` in
    `server/src/db.ts`. A separate table rather than a `kind` column, because a Web Push
    subscription's keys have no meaning for a token and the columns would be null half
    the time.
*   `POST` and `DELETE /v1/push/native` register and remove a target, with its schema in
    `shared/sync-contract.ts` beside `pushSubscriptionSchema`.
*   `server/src/push-apns.ts`: HTTP/2 to `api.push.apple.com` with a token-based (`.p8`)
    ES256 JWT, both from Node's own `http2` and `crypto`. `server/src/push-fcm.ts`: FCM's
    HTTP v1 API, with an OAuth access token minted from a service-account key by an RS256
    JWT, also with `crypto` alone. Neither needs a new package. Each returns the same
    `"sent" | "gone"` as `deliverPush` (APNs 410 or `BadDeviceToken`, FCM `UNREGISTERED`
    are "gone"), so the sweep treats every target the same way.
*   New configuration, all optional: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`, `APNS_TOPIC`
    (the bundle id), `APNS_SANDBOX`, and `FCM_SERVICE_ACCOUNT`. A server without them sends
    Web Push only, as now, and says so to a native device that asks.
*   The destination hosts are fixed (Apple's and Google's), so the public-address guard
    that protects Web Push endpoints is not needed for them. It is kept for Web Push.

**What the payload may say.** Web Push payloads are encrypted to the browser, so the push
service carries ciphertext. APNs and FCM payloads are not: Apple and Google can read them.
The payload is therefore held to the same rule as today, and it matters more here: a count
and a time, nothing sealed, nothing else. A title would need decrypting on the device
before display (an iOS Notification Service Extension or an Android service with access to
the keys), and the extension cannot read the webview's IndexedDB, so that is a later
project of its own and not part of this design.

**Client.**

*   Registering for remote notifications is native code on every platform. It goes in the
    same plugin as the Pencil work, renamed `tauri-plugin-native` (Swift for Apple, Kotlin
    for Android): it asks for permission, returns the token, and reports a token change.
*   `lib/push/` gains a native path beside the Web Push one. `subscribe.ts` asks
    `is-tauri.ts` which to use; the settings UI and the "turn on reminders" offer do not
    change.
*   **Windows and Linux** have no push service the server can reach in this cut (Windows
    has WNS, which could be a fourth sender later). There, Tauri's notification plugin
    schedules local notifications from the twigs already on the device, re-planned on
    every sync. They fire only while the app, or its tray icon, is running.

**What it costs beyond Tauri itself:** an Apple Push key in the developer account, a
Firebase project for FCM (and its `google-services.json` in the Android build), two new
sender modules and their tests under the server's coverage thresholds, and one table.

### Desktop pens

*   **Windows (WebView2):** pen pressure and tilt reach pointer events, so a Surface pen
    or a Wacom works like the Pencil in the browser.
*   **macOS (WKWebView):** a Wacom tablet reports pressure; there is no Pencil.
*   **Linux (WebKitGTK):** pressure support varies by distribution and driver. Treat it as
    mouse input unless a test machine proves otherwise.
*   **Android (system WebView):** styluses such as the S Pen report `pointerType: "pen"`
    and pressure, so they draw like the Pencil in the browser. Their side buttons are not
    bridged in this design.

### What Tauri costs

*   New tooling: Rust, Xcode, the Android SDK and NDK, the Tauri CLI, a paid Apple
    developer account (device installs, the App Store, the APNs key) and a Google Play
    developer account. CI needs a macOS runner for Apple builds and signing secrets for
    every platform.
*   New dependencies (approved with the decision to ship Tauri, listed here so the §9
    audit checks cover them): `@tauri-apps/api`, `@tauri-apps/cli`, and Tauri's
    notification and updater plugins.
*   New code: `src-tauri/` (config, Rust entry point, capabilities), `tauri-plugin-native`
    (~300 lines of Swift for Pencil and push, ~150 of Kotlin for push),
    `lib/platform/`, `lib/pencil/`, the native path in `lib/push/`, and the server's
    APNs and FCM senders.
*   Store review on every iOS and Android release; code signing and notarization on
    macOS; a signed installer on Windows.

## File layout

Following CLAUDE.md §2.1 and the size limits (150 lines for `.tsx`, 300 for `.ts`):

```
src/lib/canvas/                 pure, no React
  scene-model.ts                Zod schema, types, format constant
  input-filter.ts               which pointer draws
  stroke-geometry.ts            smoothing, pressure → outline
  hit-test.ts                   eraser and lasso
  spatial-index.ts              grid buckets
  camera.ts                     pan, zoom, screen ↔ scene
  history.ts                    undo and redo over element versions
  fractional-index.ts           index between two indexes
  render-scene.ts               draws a scene onto a 2D context
  export-scene.ts               PNG and PDF
src/lib/pencil/pencil-bridge.ts web no-op, Tauri events
src/lib/platform/is-tauri.ts
src/components/notes/canvas/
  canvas-surface.tsx            the two <canvas> layers
  canvas-toolbar.tsx            replaces spatial-notes-toolbar
  lasso-overlay.tsx
  use-canvas-input.ts           pointer events → filter → sampler
  use-canvas-camera.ts
  use-canvas-scene.ts           the scene in memory, versions, history
src-tauri/                      Tauri config, Rust entry point, capabilities
  plugins/native/               Swift (Pencil, APNs) and Kotlin (FCM)
server/src/push-apns.ts
server/src/push-fcm.ts
```

`components/notes/spatial/` keeps its PDF, image-ingest, fullscreen and autosave hooks,
rewritten against the new scene; `excalidraw-adapter.ts`, `use-excalidraw-pen.ts`,
`notes/types.ts`'s Excalidraw types and `pages/notes.css` go.

## Phases

Each phase ships on its own and leaves the app working.

1.  **Format.** `scene-model.ts` and the pure `lib/canvas/` modules, with their tests. No
    UI change.
2.  **Replace the editor.** Ink, eraser, lasso, shapes, pan and zoom, undo, images and PDF
    pages, in one change that also removes Excalidraw, its `overrides` and `notes.css`,
    rewrites the E2E specs against the new canvas, and stops CLAUDE.md, `hierarchy.md`,
    `backend.md` and `docs/feature-checklist.md` naming Excalidraw. With no notes to
    protect there is no reason to run the two editors side by side.
3.  **Export and text boxes.**
4.  **Tauri on desktop.** Windows, macOS and Linux. No plugin needed, and it proves the
    origin, CSP and service-worker changes. Local notifications on Windows and Linux.
5.  **Server push senders.** `native_push_targets`, the two routes, APNs and FCM, tested
    against recorded responses. Web Push is unchanged, so this ships before any native
    client uses it.
6.  **Tauri on iOS, iPadOS and Android.** The native plugin: push registration on both,
    then the Pencil features on iPad.
7.  **Recognition** over the stored samples, shape recognition first.

Phases 4 to 6 can run beside phase 3; none of them touches the canvas.

A rough size for phases 1 and 2: 3,000 to 5,000 lines of code and as much again in tests,
most of it in pure `lib/canvas/` modules. Phases 4 to 6 add roughly 1,500 lines across
the app, the server and the plugin, plus platform configuration.

## Testing

*   **Unit (Vitest):** everything in `lib/canvas/` is pure and held to the `lib/` coverage
    thresholds, including the schema's refusal of a malformed or unknown-format scene. The
    input filter is tested with synthetic pointer sequences (pen, palm, pinch).
*   **Merge:** `merge-scene.test.ts` is moved onto new-format scenes (strokes, shapes and
    images), keeping every case it has today.
*   **E2E (Playwright):** the canvas specs are rewritten to draw with synthetic pen events
    (Playwright can set `pointerType` and `pressure`) and measure with `inkPixels()`.
*   **By hand, on an iPad:** pressure, palm rejection, hover, the magnifier and Scribble
    suppressions, and latency. For the Tauri build, double-tap, squeeze, roll and haptics
    on a Pencil Pro. None of this can be automated here; each release that touches input
    lists what was checked.
*   **Server push:** the APNs and FCM senders are tested against recorded responses
    (success, gone, throttled, bad credentials), never the real services, under the
    server's coverage thresholds. A real send to a real device is checked by hand once
    per platform.
