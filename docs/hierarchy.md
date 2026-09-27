# All Data is stored in this archtechture

User = Flock Member

1. Wing (Workspace / Profile)
    Each user can be a part of multiple wings but they only ever own one of them

    2. Flight (Academic Term / Semester)
        Everything is sorted by Date of either creation or due date into 3 sections Summer Fall Spring and the year attached to it for easier sorting

        3. Branch (Course / Class)
            Each course is given its own "branch" to store all the tags

            4. Nest ( Tags)
                Each nest is a tag that is applied to the notes to mark units or what ever the user need or to homework to mark their type (such as projects, units, etc..)
                A nest belongs to a branch, and a feather, twig or pebble carries a list of them,
                so one nest can mark several items and one item can sit in several nests.
                The path bar still navigates by nest, so a note in two nests is reachable under both.
    
                5. Twigs (Tasks such as homeworks/exams /essays, etc..)
                6. Feathers are (Notes) for a class: TipTap rich-text HTML, an Excalidraw
                   scene, or both. Neither half is markdown, and what is stored is the
                   compressed payload rather than either one as text.
                    7. pebbles (files) such as pdfs,images, and other data
                

## How this is stored

Every level above is a record of its own in IndexedDB, keyed by a UUID and carrying
`createdAt`, `updatedAt` and a `deletedAt` tombstone. Names live only on those records, so
renaming a wing, flight, branch or nest renames it everywhere at once and changes no other
row. A feather points at its branch and lists its nests; a twig and a pebble do the same.

Only the feather's own title is stored on the feather. Everything else the UI shows as a
path is resolved from the records at read time (`src/lib/hierarchy/workspace-tree.ts`).

With a workspace passphrase set, the one display name on each of those records — a wing,
flight, branch or nest's `name`, a feather's `feather`, a twig's `title`, a pebble's
`name` — is stored encrypted, and the row says which cipher wrote it. The storage modules
seal on write and open on read, so nothing above `src/lib/` ever sees a sealed name. What
is deliberately left readable is when things happen: a twig's `dueDate`, `dueTime` and
`status`, and every timestamp. A server that held nothing but these rows could schedule a
reminder and still not know what it was for.
