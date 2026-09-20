import { useMemo, useState } from "react";

import { NotesNoteButton } from "@/components/notes/notes-note-button";
import { NotesTreeGroup } from "@/components/notes/notes-tree-group";
import { buildTree, getActivePathKeys } from "@/components/notes/notes-tree";
import type { NotesDirectoryEntry, NotesHierarchyLocation } from "@/components/notes/types";

type NotesTreeViewProps = {
  entries: NotesDirectoryEntry[];
  activeDocumentId: string | null;
  activeLocation: NotesHierarchyLocation;
  isBusy: boolean;
  onOpenDocument: (documentId: string) => void;
};

/** Saved notes grouped as Wing > Flight > Branch > Nest > Feather. */
export function NotesTreeView({
  entries,
  activeDocumentId,
  activeLocation,
  isBusy,
  onOpenDocument,
}: NotesTreeViewProps) {
  const tree = useMemo(() => {
    return buildTree(entries);
  }, [entries]);

  const activePathKeys = useMemo(() => getActivePathKeys(activeLocation), [activeLocation]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(activePathKeys));
  const [syncedPathKeys, setSyncedPathKeys] = useState(activePathKeys);

  // Whenever the active note changes, make sure the groups on its path are open.
  if (syncedPathKeys !== activePathKeys) {
    setSyncedPathKeys(activePathKeys);
    setExpandedKeys((current) => new Set([...current, ...activePathKeys]));
  }

  const setGroupExpanded = (groupKey: string, isExpanded: boolean) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (isExpanded) {
        next.add(groupKey);
      } else {
        next.delete(groupKey);
      }

      return next;
    });
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
                            entry={entry}
                            isActive={activeDocumentId === entry.id}
                            isBusy={isBusy}
                            onOpen={onOpenDocument}
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
