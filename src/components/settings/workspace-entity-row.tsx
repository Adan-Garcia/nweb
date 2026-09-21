import { type ReactNode, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import type { WorkspaceLevel } from "@/components/settings/use-workspace-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WorkspaceEntityRowProps = {
  level: WorkspaceLevel;
  id: string;
  name: string;
  isDisabled: boolean;
  children?: ReactNode;
  onRename: (name: string) => void;
  onDelete: () => void;
};

/** What a delete takes with it, said plainly, because the cascade is the surprising part. */
const CASCADE_WARNING: Record<WorkspaceLevel, string> = {
  wing: "its flights, courses, tags, notes, tasks and files",
  flight: "its courses, tags, notes, tasks and files",
  branch: "its tags, notes, tasks and files",
  nest: "nothing else — a tag is lifted off what it marked",
};

/** One row of the hierarchy: rename it in place, or delete it and everything beneath it. */
export function WorkspaceEntityRow({
  level,
  id,
  name,
  isDisabled,
  children,
  onRename,
  onDelete,
}: WorkspaceEntityRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  if (draft !== null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 py-1"
        onSubmit={(event) => {
          event.preventDefault();

          if (draft.trim().length) {
            onRename(draft.trim());
            setDraft(null);
          }
        }}
      >
        <Input
          aria-label={`New name for ${name}`}
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
          className="h-8 max-w-64"
        />
        <Button type="submit" size="sm" disabled={isDisabled || !draft.trim().length}>
          <Check className="size-4" />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(null);
          }}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="text-sm">{name}</span>
      {children}

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Rename ${name}`}
        disabled={isDisabled}
        onClick={() => {
          setDraft(name);
        }}
      >
        <Pencil className="size-4" />
      </Button>

      {isConfirming ? (
        <>
          <span className="text-xs text-muted-foreground">
            Delete {name} and {CASCADE_WARNING[level]}?
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isDisabled}
            onClick={() => {
              setIsConfirming(false);
              onDelete();
            }}
          >
            Delete
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Keep ${name}`}
            onClick={() => {
              setIsConfirming(false);
            }}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${name}`}
          disabled={isDisabled}
          onClick={() => {
            setIsConfirming(true);
          }}
          data-entity-id={id}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
