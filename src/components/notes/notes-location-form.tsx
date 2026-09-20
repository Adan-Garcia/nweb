import { useState } from "react";

import type { NotesHierarchyLocation } from "@/components/notes/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type LocationField = {
  key: keyof NotesHierarchyLocation;
  label: string;
  placeholder: string;
  className?: string;
};

const LOCATION_FIELDS: LocationField[] = [
  { key: "wing", label: "Wing", placeholder: "My Wing" },
  { key: "flight", label: "Flight", placeholder: "Spring 2026" },
  { key: "branch", label: "Branch", placeholder: "Biology 101" },
  { key: "nest", label: "Nest", placeholder: "Unit 4" },
  {
    key: "feather",
    label: "Feather (Note Name)",
    placeholder: "Exam review",
    className: "col-span-2 max-[640px]:col-span-1",
  },
];

type NotesLocationFormProps = {
  activeLocation: NotesHierarchyLocation;
  isDisabled: boolean;
  onCreateOrOpenLocation: (location: NotesHierarchyLocation) => void;
  onSaveNow: () => void;
};

/** Edit a Wing/Flight/Branch/Nest/Feather path, then open or create it. */
export function NotesLocationForm({
  activeLocation,
  isDisabled,
  onCreateOrOpenLocation,
  onSaveNow,
}: NotesLocationFormProps) {
  const [draftLocation, setDraftLocation] = useState<NotesHierarchyLocation>(activeLocation);
  const [syncedLocation, setSyncedLocation] = useState(activeLocation);

  // Whenever the active note changes, the draft restarts from it.
  if (syncedLocation !== activeLocation) {
    setSyncedLocation(activeLocation);
    setDraftLocation(activeLocation);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 max-[640px]:grid-cols-1">
        {LOCATION_FIELDS.map((field) => (
          <div key={field.key} className={cn("grid gap-1", field.className)}>
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              value={draftLocation[field.key]}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setDraftLocation((current) => ({ ...current, [field.key]: value }));
              }}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 max-[960px]:grid-cols-1">
        <Button
          type="button"
          variant="default"
          onClick={() => {
            onCreateOrOpenLocation(draftLocation);
          }}
          disabled={isDisabled}
        >
          Open or Create Path
        </Button>
        <Button type="button" variant="outline" onClick={onSaveNow} disabled={isDisabled}>
          Save Active Note
        </Button>
      </div>
    </>
  );
}
