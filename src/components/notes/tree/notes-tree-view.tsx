import { useMemo, useState } from "react";

import type { WorkspaceSelection } from "@/components/notes/location/location-hierarchy";
import { NotesNoteButton } from "@/components/notes/tree/notes-note-button";
import { buildTree, getActivePathKeys } from "@/components/notes/tree/notes-tree";
import { NotesTreeGroup } from "@/components/notes/tree/notes-tree-group";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { readExpandedGroups, writeExpandedGroups } from "@/lib/notes/notes-navigation";

type NotesTreeViewProps = {
  snapshot: WorkspaceSnapshot;
  entries: NotesDirectoryEntry[];
  activeDocumentId: string | null;
  activeSelection: WorkspaceSelection;
  isBusy: boolean;
  onOpenDocument: (documentId: string) => void;
  onRenameDocument: (documentId: string, feather: string) => void;
  onDeleteDocument: (documentId: string) => void;
};

/** Saved notes grouped as Wing > Flight > Branch > Nest > Feather. */
export function NotesTreeView({
  snapshot,
  entries,
  activeDocumentId,
  activeSelection,
  isBusy,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
}: NotesTreeViewProps) {
  const tree = useMemo(() => {
    return buildTree(snapshot, entries);
  }, [snapshot, entries]);

  const activePathKeys = useMemo(() => getActivePathKeys(activeSelection), [activeSelection]);
  // The shape the user last arranged, plus whatever the open note needs open to be seen.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set([...readExpandedGroups(), ...activePathKeys]),
  );
  const [syncedPathKeys, setSyncedPathKeys] = useState(activePathKeys);

  // Whenever the active note changes, make sure the groups on its path are open.
  if (syncedPathKeys !== activePathKeys) {
    setSyncedPathKeys(activePathKeys);
    setExpandedKeys((current) => new Set([...current, ...activePathKeys]));
  }

  // The next set is built here rather than inside the updater: remembering it is a side
  // effect, and an updater can be called more than once for one event.
  const setGroupExpanded = (groupKey: string, isExpanded: boolean) => {
    const next = new Set(expandedKeys);

    if (isExpanded) {
      next.add(groupKey);
    } else {
      next.delete(groupKey);
    }

    setExpandedKeys(next);
    writeExpandedGroups([...next]);
  };

  return (
    <div
      className="grid max-h-[min(46svh,26rem)] gap-1.5 overflow-auto pr-1"
      role="list"
      aria-label="Saved notes"
    >
      {tree.length ? (
        tree.map((wingGroup) => (
          <NotesTreeGroup
            key={wingGroup.key}
            groupKey={wingGroup.key}
            label={wingGroup.name}
            depth={0}
            itemCount={wingGroup.flights.length}
            isExpanded={expandedKeys.has(wingGroup.key)}
            onExpandedChange={setGroupExpanded}
            role="listitem"
          >
            {wingGroup.flights.map((flightGroup) => (
              <NotesTreeGroup
                key={flightGroup.key}
                groupKey={flightGroup.key}
                label={flightGroup.name}
                depth={1}
                itemCount={flightGroup.branches.length}
                isExpanded={expandedKeys.has(flightGroup.key)}
                onExpandedChange={setGroupExpanded}
              >
                {flightGroup.branches.map((branchGroup) => (
                  <NotesTreeGroup
                    key={branchGroup.key}
                    groupKey={branchGroup.key}
                    label={branchGroup.name}
                    depth={2}
                    itemCount={branchGroup.nests.length}
                    isExpanded={expandedKeys.has(branchGroup.key)}
                    onExpandedChange={setGroupExpanded}
                  >
                    {branchGroup.nests.map((nestGroup) => (
                      <NotesTreeGroup
                        key={nestGroup.key}
                        groupKey={nestGroup.key}
                        label={nestGroup.name}
                        depth={3}
                        itemCount={nestGroup.feathers.length}
                        isExpanded={expandedKeys.has(nestGroup.key)}
                        onExpandedChange={setGroupExpanded}
                      >
                        {nestGroup.feathers.map((entry) => (
                          <NotesNoteButton
                            key={entry.id}
                            snapshot={snapshot}
                            entry={entry}
                            isActive={activeDocumentId === entry.id}
                            isBusy={isBusy}
                            onOpen={onOpenDocument}
                            onRename={onRenameDocument}
                            onDelete={onDeleteDocument}
                          />
                        ))}
                      </NotesTreeGroup>
                    ))}
                  </NotesTreeGroup>
                ))}
              </NotesTreeGroup>
            ))}
          </NotesTreeGroup>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">No notes saved yet for this workspace.</p>
      )}
    </div>
  );
}
