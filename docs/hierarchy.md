# The data hierarchy

Everything in Cuervo Planner is filed the way a school year is. This is the source of truth
for that model: if the code and this file disagree, fix one of them in the same change.

A person using the app is a **flock member**.

| Level | What it is | Notes |
| --- | --- | --- |
| **Wing** | The workspace, or profile | Someone can belong to several wings but owns exactly one. |
| **Flight** | An academic term | Named by season (Spring, Summer, Fall) and year, from the date something was created or is due, so terms sort in order. |
| **Branch** | A course or class | Everything for one class hangs off its branch. |
| **Nest** | A tag | Marks units, or a kind of work (projects, labs, …). |
| **Twig** | A task | Homework, exams, essays, projects, readings. |
| **Feather** | A note | TipTap rich text, an Excalidraw scene, or both. |
| **Pebble** | A file | PDFs, images and other data brought into a note. |

```
Wing
└── Flight
    └── Branch
        ├── Nest   (tags, applied to what sits beside them)
        ├── Twig
        ├── Feather
        └── Pebble
```

## Tags are not a level

A nest belongs to a branch, and a feather, twig or pebble carries a list of nests. So one
nest can mark several items, and one item can sit in several nests. The path bar still
navigates by nest as though it were a level, so a note tagged twice is reachable under both
tags; a note with no tag shows under **Unfiled**.

## How it is stored

Every level is a record of its own in IndexedDB, keyed by a UUID and carrying `createdAt`,
`updatedAt` and a `deletedAt` tombstone. Names live only on those records, so renaming a
wing, flight, branch or nest renames it everywhere at once and changes no other row. A
feather points at its branch and lists its nests; a twig and a pebble do the same.

Only the feather's own title is stored on the feather. Everything else the UI shows as a
path is resolved from the records when it is read (`src/lib/hierarchy/workspace-tree.ts`).

A feather's body is neither HTML nor markdown at rest: what is stored is the compressed
payload of the TipTap document, the Excalidraw scene, or both.

## What the lock covers

With a passphrase set, the one display name on each record — a wing, flight, branch or
nest's `name`, a feather's `feather`, a twig's `title`, a pebble's `name` — is stored
encrypted, and the row says which cipher wrote it. The storage modules seal on write and
open on read, so nothing above `src/lib/` ever sees a sealed name.

What is deliberately left readable is when things happen: a twig's `dueDate`, `dueTime` and
`status`, and every timestamp. A server holding nothing but these rows can schedule a
reminder and still not know what it is for.

## Sharing

What can be shared on its own is a branch (a course), a nest (a unit) or a feather (a
note), each read-only or editable. A wing and a flight are never shared on their own.

The names above a shared item — its course, term and wing — travel with it as a share path,
sealed under the shared item's own key (`src/lib/hierarchy/share-path-model.ts`). A
recipient can show where it lives without being given a key that opens anything else on
that path. Where a name still cannot be read, the path says **Shared with you** rather than
guessing or leaving a blank.
