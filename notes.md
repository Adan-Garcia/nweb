
# Cuervo Planner - Technical Specification & Feature Checklist (V3 Local Architecture)

## 🎨 1. The Hybrid Editor System (UI/UX)
*Providing students with both linear note-taking and infinite spatial organization.*
- [x] **Dual-Mode Document Architecture**
  - [x] **Mode A (Linear Mode):** A standalone, full-page `tiptap` editor for traditional, Notion-style document writing.
  - [x] **Mode B (Spatial Mode):** An infinite `excalidraw` canvas for mind-mapping, whiteboard photos, and spatial organization.
- [x] **Tiptap Integration & Customization**
  - [x] Install `@tiptap/react`, `@tiptap/starter-kit`.
- [x] **Excalidraw Integration**
  - [x] Use Excalidraw as the infinite spatial canvas in Notes mode.

## 🚀 2. The Media Processing Pipeline
*Handling massive student files (lectures, textbooks, whiteboard photos) without freezing the React UI.*
- [x] **Web Worker Setup**
  - [x] Create a dedicated Web Worker (`media-worker.ts`) to handle all heavy file processing off the main React thread.
- [x] **Image Optimization (WebP)**
  - [x] Intercept clipboard `onPaste` and `onDrop` events in Excalidraw.
  - [x] Pass dropped image `File` objects to the Web Worker to draw onto an `OffscreenCanvas` and convert to `image/webp` to reduce local storage size.
- [x] **Text Compression (Brotli)**
  - [x] Implement Brotli compression in the Web Worker to compress the raw JSON state from Tiptap and Excalidraw *before* saving to local storage.

## 💾 3. Local Storage & State Management
*Ensuring students can store, access, and edit huge files efficiently directly on their device.*
- [x] **IndexedDB Migration**
  - [x] Replace standard `localStorage` with `IndexedDB` to bypass standard storage limits.
  - [x] Integrate a library like `localforage` or `idb` with your Zustand `useEventStore` persist middleware.
- [x] **Asset Separation Architecture**
  - [x] Update data models: Separate heavy media files (Images, PDFs) from lightweight metadata (Text JSON, Tags, Course info).
  - [x] Store media files locally in IndexedDB as binary blobs, and link to them in the Excalidraw JSON via local object URLs (`blob:http://...`).

