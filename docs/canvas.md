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
4.  **Notifications under Tauri are out of scope.** They will be designed separately.
5.  **No existing notes are carried over.** Nobody has notes yet, so there is no converter
    from Excalidraw's format and no version-guard release ahead of the switch. Excalidraw
    is removed in the same change that brings the new canvas in.
6.  **A note is infinite or paged, chosen when it is made.** Paged notes offer Letter and
    A4, portrait or landscape per page. Both kinds take a background: blank, dots, grid or
    ruled.
7.  **Both erasers ship first:** the stroke eraser and a pixel eraser that splits strokes.
8.  **On a device that has reported a pen, fingers pan and the pen draws.** A toggle lets
    fingers draw.
9.  **The toolbar floats at the top centre** of the canvas.
10. **Importing a PDF into a paged note makes each PDF page a note page** you write over.
    In an infinite note the pages are placed as images, as today.
11. **Colours are a theme-aware palette plus a free colour picker.** Custom colours are
    stored as they are and do not adapt to the theme.
12. **The first release also has** copy and paste across notes, pen presets, a stylus-only
    mode for desktop pen tablets, zoom-to-fit, and a page thumbnail strip for paged notes.
13. **All of it is built on one branch, `claude/canvas-design`,** and reviewed as one pull
    request at the end.
14. **Making a drawing note asks which kind**, infinite or paged, with infinite as the
    default.
15. **Desktop has single-key shortcuts.**
16. **Shapes snap:** angles and proportions with Shift, and corners to the background's
    grid on a dots or grid background.
17. **Undo history is kept with the note**, so it survives closing and reopening it.
18. **Tauri waits.** Nothing Tauri is built until asked. When it is: desktop first, then
    iPad; named Cuervo Planner, bundle id `com.cuervo.planner`; sideloaded on both, no store accounts yet. The
    test device is an iPad with an Apple Pencil Pro.

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

*   **Two kinds of note.** Infinite: pan and zoom in every direction. Paged: a vertical
    stack of Letter or A4 pages, each portrait or landscape, with a page gap between them;
    ink cannot leave a page. Pages are added at the end or after the current one, deleted,
    and reordered from the thumbnail strip. The kind is chosen when the note is made and
    does not change.
*   **Backgrounds:** blank, dots, grid or ruled, set per note on an infinite note and per
    page on a paged one. Drawn by the renderer, never stored as ink.
*   **Pen** with pressure and smoothing, **highlighter** (drawn beneath ink, translucent),
    **stroke eraser** (removes whole strokes it touches) and **pixel eraser** (cuts the
    strokes it crosses, leaving the pieces as new strokes).
*   **Shapes:** rectangle, ellipse and straight line, drawn by drag, with a stroke colour,
    a width and an optional fill.
*   **Lasso select:** move, delete, recolour, and resize by corner handles; **copy and
    paste**, within a note and across notes.
*   **Colours:** a palette of eight theme-aware inks plus a colour picker. **Pen presets:**
    up to six saved pen or highlighter setups (tool, colour, width) for one-tap switching.
*   **Input:** fingers pan once a pen has been seen, with a toggle to let fingers draw;
    **stylus-only mode** on desktop ignores mouse drawing when a pen tablet is in use.
*   **Navigation:** pan and zoom by two fingers, trackpad and wheel; **zoom-to-fit** (all
    ink on an infinite note, the current page on a paged one); a **thumbnail strip** for
    paged notes.
*   **Undo and redo** per note, kept across closing and reopening it (see "Undo history").
*   **Keyboard shortcuts** on desktop: `P` pen, `H` highlighter, `E` eraser (again to
    switch stroke/pixel), `S` shapes, `L` lasso, `0` zoom-to-fit, `Ctrl`/`⌘` + `Z`,
    `Shift`+`Z` or `Y`, `C`, `V`, and `Delete`. Ignored while typing in any input.
*   **Snapping** for shapes: with `Shift`, lines to 15° steps, rectangles to squares and
    ellipses to circles; on a dots or grid background, corners snap to the grid.
*   **Images** (drop and paste) and **PDF import** with the page picker as it is today: in
    a paged note each chosen page becomes a note page with the PDF drawn as its locked
    background, in an infinite note they are placed as images.
*   **Fullscreen, autosave, sync merge and backup**, as today. Where the browser will not
    make the canvas fullscreen (Safari on an iPhone, and on an iPad when it refuses), it
    covers the window instead.
*   **Export** to PNG and PDF, always drawn as on paper (light inks on white) whatever
    the theme: a PNG is the page in view of a paged note, or all the ink of an infinite
    one; a PDF is page for page, or the ink scaled to a Letter sheet's width and cut into
    sheets down. The PDF is one JPEG per page, written by `lib/canvas/pdf-writer.ts`
    rather than a library: pdf.js only reads.
*   **A floating toolbar** at the top centre, with what has no room in it (zoom to fit,
    pages, PDF import, export, input settings) under "More".

**Later, in this order:** text boxes; shape recognition (a hand-drawn box or circle
straightened into the shape elements above); recognition (OCR, math, vocabulary).

Arrows, connectors, diamonds, libraries, collaboration cursors and Mermaid import are
dropped.

## The scene format

Declared once, as a Zod schema in `lib/canvas/scene-model.ts`, with the TypeScript types
inferred from it.

```ts
type Scene = {
  format: 1;                       // bumped when the shape of an element changes
  layout: "infinite" | "paged";    // fixed when the note is made
  background?: Background;         // infinite notes only; pages carry their own
  elements: SceneElement[];
  view?: { x: number; y: number; zoom: number }; // this device's; never merged
};

type Background = "blank" | "dots" | "grid" | "ruled";

// A colour is a palette token ("ink-blue", resolved per theme) or a custom "#rrggbb",
// drawn as stored.
type Color = string;

type ElementBase = {
  id: string;        // UUID
  version: number;   // +1 on every change
  index: string;     // fractional stacking key
  x: number;         // origin in scene units, or relative to its page
  y: number;
  pageId?: string;   // paged notes: the page this element sits on
  locked?: boolean;
};

// A page is an element like any other, so merge handles adding, deleting and
// reordering pages without code of its own; its `index` is its place in the stack.
type Page = ElementBase & {
  type: "page";
  size: "letter" | "a4";
  orientation: "portrait" | "landscape";
  background: Background;
  pdf?: { fileId: string }; // the imported PDF page drawn under the ink
};

type Stroke = ElementBase & {
  type: "stroke";
  tool: "pen" | "highlighter";
  color: Color;
  width: number;     // base width; pressure scales it
  sensitivity?: number; // pen only, 0–1: how much pressure thins it (absent: 0.45)
  smoothing?: number;   // 0–1: the smoothing setting when it was drawn (absent: 0.5)
  zoom?: number;     // the view's zoom when drawn; smoothing works in its screen pixels
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
  color: Color;
  strokeWidth: number;
  fill: Color | null;
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

Elements on a page store coordinates relative to that page, so inserting, deleting or
reordering pages moves the ink with them and never rewrites a stroke. A page's position in
scene space is derived from the stack when it is drawn.

**The pixel eraser** replaces a stroke it cuts with new strokes (new ids) for the pieces
that remain, and removes the original. If another device edited the original at the same
time, the merge's "an edit beats a delete" rule brings it back beside the pieces: the
safe direction, since a duplicate is easy to erase and lost ink is not.

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
    *   A mouse draws with the left button and pans with the middle, except in
        stylus-only mode, where it only pans and selects.
*   **Sampler.** Reads `getCoalescedEvents()` where it exists (feature-detected; it is
    not in every Safari) so a fast stroke keeps every sample the hardware delivered, not
    just one per frame.
*   **Smoother** (`lib/canvas/stroke-path.ts` and `stroke-geometry.ts`, pure). The raw samples are what is
    stored (except that a pen's touch-down sample, which reports 0 before the sensor
    reads, takes the first real pressure); everything below runs again at render time, so
    it can change without rewriting notes. Every distance below is in screen pixels at
    the zoom the stroke was drawn at, which the stroke records: the hand's jitter is a
    pixel or so wherever the view is, so a stroke drawn zoomed out to 25% is smoothed over
    four times as much of the scene, and one drawn at 400% keeps detail a quarter the
    size. In order:
    *   a centred, weighted average along the line (a Gaussian by distance, not by
        count), its reach up to 12 pixels times the stroke's smoothing, shortened where
        the pen moved quickly (halved at a quarter of a pixel a millisecond) so slow,
        careful lines lose their shake and quick handwriting keeps its loops. The line is
        continued past each end by its own reflection, so the ends stay where the pen
        was. This replaced a one-euro filter: running with the pen, it lagged on slow
        strokes and then caught up in jumps that drew as straight runs between kinks;
    *   pressure averaged over ±24 ms, by time rather than by count, so a 240 Hz pen's
        sensor noise does not ripple the edges and a quick stroke's few samples do not
        jump in width;
    *   samples closer than 1.5 pixels to the last one kept are dropped, the last one
        too: the outline's edge is set square to each step, and on a slow stroke steps
        that short point every which way with the jitter;
    *   hooks are trimmed: within 4 pixels plus half the width of either end, steps that
        turn back on the line's heading go. A pen settling as it lifts flicks back a
        fraction, and the outline puts a round cap on any sharp turn, which drew as a
        ball at the end of the line;
    *   the path is filled in along a Catmull-Rom curve to at most two pixels a step,
        because Safari on an iPad delivers one sample per frame and a fast curve between
        them would otherwise be straight lines;
    *   a centred average over those points, which does not lag the pen as a filter
        would, takes out what corners are left: two passes at the default smoothing, none
        at 0. It runs after the filling in, so it only ever averages short steps and never
        flattens a quick stroke's few samples.
*   **Outline.** Pressure → width along the path, with tapered ends, producing a closed
    polygon filled in one call, traced through the midpoints of its edges with quadratic
    curves so it shows no facets. This is `perfect-freehand`'s `getStroke`, called from
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
*   Order within the scene layer: backgrounds and page sheets, then PDF page backgrounds
    and images, then highlighter strokes, then pen strokes and shapes. The highlighter is
    translucent and beneath the ink, so it never dims the writing it marks.
*   A paged note clips each page's elements to its sheet, and only the pages in or near
    the viewport are drawn. The thumbnail strip renders pages through the same function
    at a small scale, cached until the page's elements change.

### Selection

The lasso's selection box has a handle on each corner. Dragging one scales the selection
about the opposite corner by one factor for both axes, widths included, so handwriting
stays handwriting. Along the bottom of the canvas, while the lasso is the tool, a bar
holds copy, paste and delete for a tablet with no keyboard.

### Copy and paste

Copying a lasso selection puts it on an in-app clipboard (`lib/canvas/canvas-clipboard.ts`,
the elements plus the image files they point at) and a PNG of it on the system clipboard,
so it can also be pasted into another app. Pasting into any note, the same or another,
gives the elements new ids and indexes above everything else, lands them at the centre of
the view (or the current page), and adds any images to the target note's files; because
image ids are content hashes, the same picture is still stored once. Pages themselves are
not copied. The in-app clipboard lives in memory for the tab, as the open note already
does, and holds each image's bytes, so a picture still pastes after its note has closed.
Beside the PNG goes a marker naming the copy: a paste whose system clipboard carries the
marker (or no picture at all) pastes the in-app copy, and one carrying another app's
picture is left to the image paste.

### Undo history

History is kept per note and per device, in the same unsynced device store as the input
settings below, sealed through the cipher seam like any other note content. It is not put
in the scene: the scene syncs and merges, and one device's undo steps mean nothing on
another.

*   Each step is the set of elements before and after one action (a stroke, an erase, a
    lasso move, a paste), not a whole-scene snapshot.
*   Undoing a step only touches elements whose current `version` is still the one that
    step left. An element changed since — by another device through sync, or on this one
    — is skipped, so undo never reverts someone else's work.
*   The last 200 steps are kept, and deleting a note deletes its history.
*   The history is read when the note opens and written a second after each change and
    when it closes, never before it has been read. Steps made while it loads go on top
    of the saved ones. A history that cannot be read (a passphrase changed under it, a
    row from a newer build) is dropped rather than reported: it costs undo steps, never
    the note.

### Settings

*   **Pen presets** and **smoothing strength** follow the person, so they go in the synced
    `preferences` row (`lib/preferences/preferences-model.ts`) as `penPresets` and
    `penSmoothing`, with defaults; old rows still parse, and a preset that does not read
    costs only itself. Their bounds are in `lib/canvas/pen-settings.ts`, kept apart from
    the rest of the canvas because the preferences are read for the first paint.
    *   A preset is a pen or highlighter with its colour, width and pressure
        sensitivity; up to six, shown beside the palette for one tap. The pen settings
        panel (width, pressure, smoothing) saves the pen in hand as one and removes them.
    *   Smoothing and pressure sensitivity are both stored on each stroke as it is
        drawn: changing either changes the next line, never the ones already on the
        page. "A fineliner" and "a brush" are different pens, not a different view.
*   **Draw with finger**, **stylus-only** and undo history are about the device in hand (an iPad and a
    desktop with a tablet want opposite answers), so they stay on the device, in two
    unsynced stores added at `NOTES_DB_VERSION` 16: `canvas-settings` (one row, not
    sealed, nothing in it is content) and `canvas-history` (a row per note, its steps
    sealed whole and moved by a rekey like the rest of the content). Both live in the
    More menu, where "Draw with finger" off means the default: fingers draw until a pen
    has been seen.

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
*   `preventDefault` on `touchstart` (`use-canvas-touch-guard.ts`), so Scribble does not
    read quick strokes in a row as handwriting and cancel them, and a double tap does not
    zoom. Cancelling `pointerdown` is not enough for either.

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
| Reminders | Web Push through the service worker (`lib/push/`). | Not in this design. A native webview has no Web Push, so a Tauri build offers no reminders until notifications are designed separately; the reminder settings and the "turn on reminders" offer are hidden there rather than shown broken. |
| Updates | A deploy is picked up on the next load. | A new build per release: App Store review on iOS, the updater plugin on desktop. Old versions live longer, so once people have notes a scene-format change needs an upgrade step, and the unknown-format refusal above keeps an old build from overwriting a newer note. |
| Storage | IndexedDB in the browser profile; Safari may evict it for a site not added to the home screen. | IndexedDB in the app's own container, kept until the app is deleted. A durability win. |
| "Keep me signed in" | Non-extractable keys in IndexedDB. | Unchanged. The Keychain is possible later through a plugin but not needed. |
| Security policy | The server's headers. | A CSP in `tauri.conf.json`; it must allow `wasm-unsafe-eval` (Argon2 and Brotli) and `connect-src` to the chosen sync server. |
| File import | `<input type="file">` and drag and drop. | Both still work. The dialog and filesystem plugins are optional. |

The detection is one function, `lib/platform/is-tauri.ts`, reading `window.__TAURI_INTERNALS__`
(what `@tauri-apps/api` checks). Nothing else branches on the platform; each seam that
differs (`service-worker.ts`, the reminder offer, and the Pencil bridge below) asks it.

### The Pencil plugin

A plugin of our own, `tauri-plugin-pencil`, in Swift for iOS; it does nothing on every
other platform. It attaches to the webview and forwards what the web cannot see:

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
*   **Android (system WebView):** styluses such as the S Pen report `pointerType: "pen"`
    and pressure, so they draw like the Pencil in the browser. Their side buttons are not
    bridged in this design.

### What Tauri costs

*   New tooling: Rust, Xcode, the Android SDK and NDK, the Tauri CLI, a paid Apple
    developer account (device installs and the App Store) and a Google Play
    developer account. CI needs a macOS runner for Apple builds and signing secrets for
    every platform.
*   New dependencies (approved with the decision to ship Tauri, listed here so the §9
    audit checks cover them): `@tauri-apps/api`, `@tauri-apps/cli`, and Tauri's
    updater plugin.
*   New code: `src-tauri/` (config, Rust entry point, capabilities), `tauri-plugin-pencil`
    (~250 lines of Swift), `lib/platform/` and `lib/pencil/`.
*   Store review on every iOS and Android release; code signing and notarization on
    macOS; a signed installer on Windows.

## File layout

Following CLAUDE.md §2.1 and the size limits (150 lines for `.tsx`, 300 for `.ts`). What
is built is marked; the rest is still to come.

```
src/lib/canvas/                 pure, no React (built)
  scene-model.ts                Zod schema, types, format constant, read and serialize
  scene-edits.ts                move, recolour, remove, order keys on top, files used
  fractional-index.ts           order keys between two others
  geometry.ts, camera.ts        points, rectangles; pan, zoom, pinch, fit, opening view
  pages.ts, backgrounds.ts      the page stack; dots, grid and ruled marks
  colors.ts                     palette tokens → colours per theme
  pen-settings.ts               pen presets, smoothing and width bounds
  stroke-geometry.ts            sample encoding, pressure → outline
  stroke-path.ts                smoothing, crowded samples, end hooks, filling in
  element-bounds.ts, hit-test.ts, spatial-index.ts
  pixel-erase.ts, snapping.ts, history.ts, canvas-clipboard.ts
  input-filter.ts, shortcuts.ts, tools.ts
  gesture-types.ts, gestures.ts one press-to-lift per tool, as plain objects:
  ink-gestures.ts, erase-gestures.ts, select-gestures.ts
  media-placement.ts            where dropped images and imported PDF pages go
  canvas-files.ts               content-hash ids for dropped images
  render-elements.ts, render-scene.ts   drawing onto any 2D context
  resize-gestures.ts            corner handles; scaling a selection
  history-storage.ts, input-settings-storage.ts   this device's undo steps and input
  export-scene.ts, pdf-writer.ts   what an export draws; a PDF of JPEG pages
src/components/notes/spatial/   the canvas's React side (built)
  spatial-notes-editor.tsx      the note: its canvas, or why it cannot be shown
  canvas-editor.tsx             toolbar, surface and the hooks that tie them together
  canvas-surface.tsx            the scene and live <canvas> layers
  canvas-toolbar.tsx, canvas-tool-buttons.tsx, canvas-color-swatches.tsx
  canvas-preset-buttons.tsx, canvas-pen-panel.tsx
  canvas-labels.ts              what a colour or a preset is called on a button
  canvas-theme.ts               design tokens → colours a 2D context can use
  use-canvas-scene.ts           scene, files, history, selection; gestures as one step
  use-canvas-camera.ts, use-canvas-wheel.ts
  use-canvas-pointer.ts         pointer events → input rules → gestures
  use-canvas-renderer.ts, use-canvas-images.ts
  use-canvas-tools.ts           tool; colour, width, pressure per kind of mark; presets
  use-canvas-shortcuts.ts       keys, and zoom-to-fit
  use-canvas-image-drop.ts, use-canvas-pdf-import.ts
  use-spatial-autosave.ts       saves the scene, each new image once
  use-canvas-editor.ts          every hook above tied to one scene, for canvas-editor.tsx
  use-canvas-clipboard.ts       copy (in-app and a PNG), paste, delete
  use-canvas-history-storage.ts, use-canvas-input-settings.ts
  use-canvas-export.ts, canvas-raster.ts   PNG and PDF export; any region to a canvas
  use-canvas-pages.ts           the page in view; add, move, delete, go to
  page-thumbnails.tsx, page-thumbnail.tsx   the strip, each page redrawn only when it changes
  canvas-popover.tsx, canvas-more-menu.tsx, canvas-menu-items.tsx, canvas-selection-bar.tsx
src/lib/pencil/pencil-bridge.ts web no-op, Tauri events (Tauri)
src/lib/platform/is-tauri.ts    (Tauri)
src-tauri/                      Tauri config, Rust entry point, capabilities (Tauri)
  plugins/pencil/               Swift (iOS)
```

The canvas went into `spatial/`, the folder the old editor was in, rather than a new
`canvas/` one: it is the same feature, and the notes pipeline (hydration, autosave, flush)
already lived beside it.

## Phases

All on `claude/canvas-design`, one commit or more per step, every step leaving the checks
(`format:check`, `typecheck`, `lint`, `test`, `build`) passing. One pull request at the end.

1.  **Format and pure logic.** `scene-model.ts` and every pure `lib/canvas/` module:
    geometry, both erasers, hit testing, pages, backgrounds, camera, history, clipboard,
    colours. With tests; no UI change. *Done: every module at full coverage.*
2.  **Replace the editor.** The canvas surface, input, toolbar, lasso, shapes, both note
    kinds, backgrounds, images and PDF import, in one change that also removes
    Excalidraw, its `overrides` and `notes.css`, rewrites the E2E specs against the new
    canvas, and stops CLAUDE.md, `hierarchy.md`, `backend.md` and
    `docs/feature-checklist.md` naming Excalidraw.

    The merge needs one addition here: if one device deletes a page while another writes
    on it, the ink survives the merge (an edit beats a delete) but its page does not.
    `merge-scene.ts` should bring back a page that surviving elements still point at,
    rather than leave ink the renderer cannot place. *Done, including that.* Moved to step
    3: resizing a selection by its corners, and a toolbar that fits a phone in one row.
3.  **The rest of the first release.** Resizing a selection, copy and paste, pen presets and the colour picker,
    stylus-only and finger settings, zoom-to-fit, the thumbnail strip, export, undo
    history kept with the note, and a toolbar that fits a phone in one row (narrower than
    640 pixels, the colours and presets move into the pen panel and fullscreen into
    More). *Done.*
4.  **Hand check on the iPad** with the Pencil Pro (see "Testing"), and fixes from it.

Later, each only when asked: text boxes; Tauri on desktop, then iPad with the Pencil
plugin; recognition, shape recognition first.

A rough size for phases 1 to 3: 5,000 to 7,000 lines of code and about as much again in
tests, most of it in pure `lib/canvas/` modules. Paged notes and the pixel eraser are the
two largest additions over the earlier estimate.

## Testing

*   **Unit (Vitest):** everything in `lib/canvas/` is pure and held to the `lib/` coverage
    thresholds, including the schema's refusal of a malformed or unknown-format scene. The
    input filter is tested with synthetic pointer sequences (pen, palm, pinch).
*   **Merge:** `merge-scene.test.ts` is moved onto new-format scenes (strokes, shapes,
    images and pages), keeping every case it has today, plus a page reordered on one side
    and written on on the other, and a stroke cut by the pixel eraser on one side and
    recoloured on the other.
*   **E2E (Playwright):** the canvas specs are rewritten to draw with synthetic pen events
    (Playwright can set `pointerType` and `pressure`) and measure with `inkPixels()`.
*   **By hand, on an iPad:** pressure, palm rejection, hover, the magnifier and Scribble
    suppressions, and latency. For the Tauri build, double-tap, squeeze, roll and haptics
    on a Pencil Pro. None of this can be automated here; each release that touches input
    lists what was checked.
