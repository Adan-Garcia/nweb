# The canvas

Written 2026-09-30. This is a proposal: nothing in it is built. It describes how to replace
Excalidraw with a canvas of our own, what Apple Pencil support means in a browser and what
it takes beyond one, and what changes if the app is also shipped as a Tauri app. Each part
can be decided on its own; the canvas does not depend on Tauri, and Tauri does not depend
on the canvas.

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
    because one picture dropped into two notes is one row. Use the same hash Excalidraw
    uses, so an image dropped after the switch deduplicates against rows written before it.
    PDF pages keep their random ids (`newSceneFileId`), as today.

The storage row does not change either: the scene is still one JSON string, compressed
(`sceneCompressed`, `sceneCompressionAlgorithm`) and sealed through the cipher seam, with
its files listed in `sceneFiles`. So there is no IndexedDB version bump. What changes is
what is inside the string.

## Scope

**First release (replaces Excalidraw):**

*   Pen with pressure and smoothing, highlighter, stroke eraser, lasso select (move,
    delete, recolour), a small colour set and the width slider.
*   Pan and zoom by two fingers, trackpad and wheel; infinite in every direction.
*   Undo and redo.
*   Images (drop and paste) and PDF pages, with the page picker as it is today.
*   Fullscreen, autosave, sync merge and backup, as today.
*   Reading every note Excalidraw wrote (see "Reading old notes").
*   Export of a note to PNG and PDF.

**Later, in this order:** text boxes; shapes (drawn by hand and straightened by shape
recognition rather than picked from a toolbar); a pixel eraser that splits strokes; ruled
and grid backgrounds; recognition (OCR, math, vocabulary).

Arrows, connectors, libraries, collaboration cursors and Mermaid import are dropped. A note
that contains them is still shown (see below), just no longer editable as those things.

## The scene format

Declared once, as a Zod schema in `lib/canvas/scene-model.ts`, with the TypeScript types
inferred from it.

```ts
type Scene = {
  format: 2;                       // 1 is Excalidraw's JSON; see "Version guard"
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

type ImageElement = ElementBase & {
  type: "image";
  fileId: string;    // content hash, or a random id for a PDF page
  width: number;
  height: number;
};

type LegacyElement = ElementBase & {
  type: "legacy";
  // An Excalidraw element with no equivalent yet (text, arrow, rectangle…),
  // kept verbatim so nothing is lost, rendered as a flattened preview.
  source: unknown;
};
```

Samples are a flat number array because a note is thousands of strokes of hundreds of
points; objects per point would triple the stored size before compression. Coordinates are
rounded to two decimals and pressure and tilt to three before saving.

`lib/sync/merge-scene.ts` keeps working because it only reads `id`, `version` and `index`;
its comments stop naming Excalidraw, and the whole-scene key it copies from the local side
becomes `view` instead of `appState`.

## Reading old notes

`lib/canvas/excalidraw-import.ts` converts format 1 to format 2 when a scene is read. It is
pure, has no Excalidraw import (it reads the JSON through its own loose Zod schema), and is
the only place that knows Excalidraw's shape.

| Excalidraw element | Becomes |
| --- | --- |
| `freedraw` | `stroke`, with its `points` and `pressures`; tilt 0, time evenly spaced. |
| `image` | `image`, same `fileId`. |
| `line` / `draw` with points | `stroke` with pressure 0.5. |
| `text`, `rectangle`, `ellipse`, `diamond`, `arrow` | `legacy` until text and shapes exist; then converted properly. |
| `isDeleted: true` | dropped. |

Ids, versions and indexes carry over unchanged, so a note converted on two devices converts
to the same thing and the next sync merges cleanly. A converted note is written back in
format 2 on its next save and not before: opening a note never writes it.

The same converter runs on a restored backup, so a backup made before the switch restores
after it.

### Version guard

A device still on the old app will receive format-2 scenes by sync. Excalidraw would read
it as an empty scene, and its autosave could then write the empty scene back over the
note. So:

1.  **Ship the guard first, in a release of its own, before the canvas.** It teaches the
    current Excalidraw editor to check `format`: a scene whose `format` is above what the
    app knows is shown as "This note needs a newer version of the app", read-only, and
    never autosaved.
2.  The new canvas applies the same rule to any future `format: 3`.

The service worker picks a new build up on the next load, so the window is short, but a
tablet left open for a week is exactly the device that would lose a note.

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
    polygon filled in one call. `perfect-freehand` does exactly this in ~300 lines and is
    MIT with no dependencies; it is a new package and needs approval under CLAUDE.md §9.
    The alternative is to write it ourselves in the same file.
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
| Reminders | Web Push through the service worker (`lib/push/`). | No Web Push in a native webview. Local reminders move to Tauri's notification plugin, scheduled on the device from the twigs it already has; remote push needs APNs (iOS) and FCM (Android) senders on the server beside the VAPID one. That is a server change, and a real one. |
| Updates | A deploy is picked up on the next load. | A new build per release: App Store review on iOS, the updater plugin on desktop. The version guard above matters more, because old versions live longer. |
| Storage | IndexedDB in the browser profile; Safari may evict it for a site not added to the home screen. | IndexedDB in the app's own container, kept until the app is deleted. A durability win. |
| "Keep me signed in" | Non-extractable keys in IndexedDB. | Unchanged. The Keychain is possible later through a plugin but not needed. |
| Security policy | The server's headers. | A CSP in `tauri.conf.json`; it must allow `wasm-unsafe-eval` (Argon2 and Brotli) and `connect-src` to the chosen sync server. |
| File import | `<input type="file">` and drag and drop. | Both still work. The dialog and filesystem plugins are optional. |

The detection is one function, `lib/platform/is-tauri.ts`, reading `window.__TAURI_INTERNALS__`
(what `@tauri-apps/api` checks). Nothing else branches on the platform; each seam that
differs (`service-worker.ts`, `push/`, and the Pencil bridge below) asks it.

### The Pencil plugin

A Tauri mobile plugin, `tauri-plugin-pencil`, in Swift for iOS (and a no-op on every other
platform). It attaches to the webview and forwards what the web cannot see:

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

### Desktop pens

*   **Windows (WebView2):** pen pressure and tilt reach pointer events, so a Surface pen
    or a Wacom works like the Pencil in the browser.
*   **macOS (WKWebView):** a Wacom tablet reports pressure; there is no Pencil.
*   **Linux (WebKitGTK):** pressure support varies by distribution and driver. Treat it as
    mouse input unless a test machine proves otherwise.

### What Tauri costs

*   New tooling: Rust, Xcode, the Tauri CLI, and a paid Apple developer account for
    installing on a device and for the App Store. CI needs a macOS runner for iOS builds.
*   New dependencies, each needing approval under §9: `@tauri-apps/api` and
    `@tauri-apps/cli`, the notification and updater plugins.
*   New code: `src-tauri/` (config, Rust entry point, capabilities), the Swift plugin
    (~300 lines), `lib/platform/`, `lib/pencil/`, and the reminder rework.
*   A server change for native push, if remote reminders are wanted on iOS.
*   Every release goes through App Store review.

## File layout

Following CLAUDE.md §2.1 and the size limits (150 lines for `.tsx`, 300 for `.ts`):

```
src/lib/canvas/                 pure, no React
  scene-model.ts                Zod schema, types, format constant
  excalidraw-import.ts          format 1 → 2
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
src-tauri/                      only if Tauri goes ahead
```

`components/notes/spatial/` keeps its PDF, image-ingest, fullscreen and autosave hooks,
rewritten against the new scene; `excalidraw-adapter.ts`, `use-excalidraw-pen.ts`,
`notes/types.ts`'s Excalidraw types and `pages/notes.css` go.

## Phases

Each phase ships on its own and leaves the app working.

1.  **Version guard.** The `format` check in today's editor, released alone. Small.
2.  **Format and converter.** `scene-model.ts`, `excalidraw-import.ts`, tests against real
    scenes exported from today's app. No UI change.
3.  **Canvas behind a setting.** Ink, eraser, pan and zoom, undo, images and PDF pages.
    Off by default; Excalidraw is still the editor unless it is turned on.
4.  **Switch over.** The new canvas becomes the only editor; Excalidraw, its `overrides`
    and `notes.css` are removed; the E2E specs are rewritten against it; CLAUDE.md and
    `docs/feature-checklist.md` stop naming Excalidraw.
5.  **Lasso, export, text.**
6.  **Tauri, if wanted.** Desktop first (no plugin needed, and it proves the origin, CSP and
    service-worker changes), then iOS with the Pencil plugin, then native reminders.
7.  **Recognition** over the stored samples.

A rough size for phases 1 to 4: 3,000 to 5,000 lines of code and as much again in tests,
most of it in pure `lib/canvas/` modules.

## Testing

*   **Unit (Vitest):** everything in `lib/canvas/` is pure and held to the `lib/` coverage
    thresholds. The converter is tested against fixtures saved from today's app, including
    images, PDF pages, deleted elements and the element types that become `legacy`. The
    input filter is tested with synthetic pointer sequences (pen, palm, pinch).
*   **Merge:** `merge-scene.test.ts` gains format-2 cases; a converted note merged with an
    unconverted one must give the same result on both devices.
*   **E2E (Playwright):** the canvas specs are rewritten to draw with synthetic pen events
    (Playwright can set `pointerType` and `pressure`) and measure with `inkPixels()`.
*   **By hand, on an iPad:** pressure, palm rejection, hover, the magnifier and Scribble
    suppressions, and latency. For the Tauri build, double-tap, squeeze, roll and haptics
    on a Pencil Pro. None of this can be automated here; each release that touches input
    lists what was checked.

## Open questions

1.  `perfect-freehand`, or our own outline code?
2.  Is dropping arrows, connectors and Excalidraw's shape tools acceptable, given shapes
    come back later through recognition?
3.  Does anyone besides the owner have notes on another device that might stay on an old
    version? That decides how long phase 1 must be out before phase 4.
4.  Is Tauri wanted for the Pencil features alone, or also for desktop and app-store
    distribution? That decides whether phase 6 starts with desktop or goes straight to iOS.
5.  For reminders under Tauri: local notifications only, or native remote push too (the
    server change)?
