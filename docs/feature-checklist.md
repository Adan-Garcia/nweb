# Cuervo Planner — feature checklist

What the app does today, by area, and what is known to be missing. Checked items are built
and covered by tests. The design reasons live in [`backend.md`](./backend.md) and
[`hierarchy.md`](./hierarchy.md); the rules for changing any of it live in
[`CLAUDE.md`](../CLAUDE.md).

## 1. Notes

- [x] **Two kinds of note.** Linear notes in a full-page TipTap editor; spatial notes on an
      infinite Excalidraw canvas. A note is created as one or the other.
- [x] **Autosave.** Every edit is saved as you type, and flushed before switching notes.
- [x] **Files on the canvas.** Drop or paste an image; import a PDF and choose which pages to
      draw. Fullscreen canvas and pen support.
- [x] **Finding a note.** A path bar (wing → flight → branch → nest → note) or a tree of every
      saved note, remembered between visits; ⌘K searches every note by title.

## 2. Planning

- [x] **Calendar.** Month and week views, filters by course and status, drag a task onto
      another day.
- [x] **Board.** Todo, Started and Done columns; drag to reorder or to change status.
- [x] **Dashboard.** Next priority, what is due today and overdue, upcoming deadlines and
      recent notes. Which cards show, and their order, is up to you.
- [x] **Reminders.** A notification bell while the app is open; push reminders with an
      account.

## 3. Storage and media

- [x] **IndexedDB for everything.** Notes, tasks, files and the hierarchy each have a store;
      `localStorage` holds only what the first paint needs (appearance, notes navigation,
      the lock hint) and which sync server this device uses.
- [x] **Media off the main thread.** A Web Worker turns dropped images into WebP and
      compresses note bodies with Brotli before they are stored.
- [x] **Heavy files kept apart.** Images and PDFs are stored as blobs and referenced from the
      canvas, not embedded in it.
- [x] **Backups.** Download the workspace as a file, optionally encrypted; restore it
      replacing what is here, or merged note by note.

## 4. Privacy and security

- [x] **A local account on every device.** A name, an email and a passphrase, set up at
      `/auth/signup` before the workspace opens. The passphrase encrypts note content,
      drawings, files and every name with AES-GCM under an Argon2id key; dates and statuses
      stay readable on purpose. Signing in on a device is its passphrase, with no network.
- [x] **Changing it** rewrites every row in one resumable pass.
- [x] **Erasing the device** from Settings forgets every note, key and setting on it.
- [x] **No logging of content or credentials**, and no analytics.

## 5. Accounts, sync and sharing (needs a server)

- [x] **Sync account (optional).** Created when signing up or from Settings → Sync server,
      on a server you choose; it uses the local account's passphrase, split so the server
      never learns the key the data is encrypted with. A new device signs in to it at
      `/auth/signin`, and one that already has notes chooses to keep them or replace them.
- [x] **Disconnecting or deleting it.** Disconnecting keeps every note on the device under
      its own passphrase; deleting erases everything the server holds for the account.
- [x] **Sync.** Rows and files travel sealed; two edits of one row merge by paragraph, word,
      shape or field. Devices are nudged live over a WebSocket.
- [x] **Sharing.** A course, a unit or a note, read-only or editable. Revoking someone rotates
      the key; keys also rotate after ninety days.
- [x] **Push reminders** that say something is due, never what.

## 6. Interface

- [x] **Themes.** System, light, paper, dark and black; eight accents checked for contrast;
      density and text size. Painted before any script loads, and synced with an account.
- [x] **Navigation.** A collapsible sidebar in the order you choose, a phone tab bar, and a
      ⌘K command palette.
- [x] **Installable and offline.** A hand-written service worker serves the app with no
      connection.

## 7. Not built yet

- [ ] Two people rewriting the same words at once keeping both versions (needs a CRDT).
- [ ] Revoking the grants on a key after it has been rotated.
- [ ] Live updates across more than one server process.
- [ ] Paid hosting plans.
