# Cuervo Planner - Feature Checklist (V2 Architecture)

## 📝 1. Core Application & Relational UI
*Built on React, TypeScript, and Zustand to manage the Workspace $\rightarrow$ Term $\rightarrow$ Course $\rightarrow$ Item hierarchy.*
- [ ] **State Management & Data Layer**
  - [ ] Implement `usePlannerStore` (Zustand) for UI state (modals, active views).
  - [ ] Implement `useEventStore` (Zustand) for core data to eliminate React re-render loops.
  - [ ] Define strict TypeScript interfaces for `DecryptedTask`, `DecryptedNote`, and `EncryptedPayload`.
- [ ] **Component System**
  - [ ] Integrate `shadcn/ui` (Radix UI + Tailwind) for accessible, headless components (modals, dropdowns) matching the dark-mode aesthetic.
  - [ ] Implement `zod` schemas and React Hook Form for type-safe, zero-re-render task/note creation.
- [ ] **Interactive Views**
  - [ ] Implement `@dnd-kit` for drag-and-drop functionality on the Calendar and Kanban task views.
  - [ ] Build the integrated Note editor, allowing Tasks to be tagged or embedded directly within rich-text Notes.

## ⚡️ 2. Real-Time Sync & Optimistic Concurrency
*Powered by Supabase, completely replacing the custom Node.js/Socket.io backend.*
- [ ] **Database & Network Layer**
  - [ ] Setup Supabase project (PostgreSQL) to store encrypted data blobs.
  - [ ] Implement Supabase Realtime subscriptions (`postgres_changes`) to replace manual socket event listeners.
- [ ] **Conflict Resolution (OCC)**
  - [ ] Port existing Optimistic Concurrency Control (OCC) logic to the new `SyncService.ts`.
  - [ ] Port the 3-way field-level merge algorithm (`mergeUtils.js`) to handle offline-to-online sync conflicts natively.
- [ ] **Offline Persistence**
  - [ ] Configure Zustand middleware to persist the decrypted state to local browser storage for offline access.

## 🛡️ 3. Zero-Knowledge Envelope Encryption
*Moving from a shared room password to a robust, user-specific cryptographic model.*
- [ ] **Key Generation & Storage**
  - [ ] Generate User Keypairs (Public Key stored on server, Private Key stored safely on device).
  - [ ] Build the DEK (Data Encryption Key) generator. Every new Course or individual Note receives a unique, randomly generated AES-GCM DEK.
- [ ] **Encryption Pipeline**
  - [ ] Build `CryptoService.ts` to act as middleware: UI updates Zustand $\rightarrow$ CryptoService encrypts $\rightarrow$ Supabase receives ciphertext.
  - [ ] Ensure the server only stores encrypted payloads and encrypted keys.

## 🤝 4. Granular Sharing & Access Control
*Secure multi-user collaboration with the ability to safely revoke access.*
- [ ] **Sharing Infrastructure**
  - [ ] Configure Supabase Row Level Security (RLS) to enforce who can download which encrypted Course/Note blobs.
  - [ ] Build the Key Exchange mechanism: Alice's client fetches Bob's Public Key, encrypts the Course DEK with it, and uploads the Encrypted DEK to Supabase.
- [ ] **The Roster Change Problem (Revocation)**
  - [ ] Implement Server-Side Revocation: Supabase RLS immediately drops the removed user's access to the database.
  - [ ] Implement Client-Side Lazy Revocation: When a remaining user edits a note in a course where someone was recently removed, the app generates a new DEK, re-encrypts the edited note, and distributes the new DEK only to active members.

## 📱 5. Cross Platform Deployment
*Access the planner seamlessly across web, desktop, and mobile.*
- [ ] **Progressive Web App (PWA)**
  - [ ] Setup `manifest.json` with icons and theme colors.
  - [ ] Configure Vite PWA plugin (`vite-plugin-pwa`) for offline caching of app assets.
- [ ] **Native Wrappers**
  - [ ] Wrap the web application using Tauri. This ensures instant loading, native UI performance, and full access to the Web Crypto API (`window.crypto.subtle`) for heavy encryption tasks without the overhead of a WebGL canvas.