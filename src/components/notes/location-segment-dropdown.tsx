import type { SegmentOption } from "@/components/notes/location-hierarchy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotesLocationSegmentDropdownProps = {
  prepend?: React.ReactNode;
  triggerLabel: string;
  currentLabel: string;
  addLabel: string;
  options: SegmentOption[];
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  append?: string;
};

export function NotesLocationSegmentDropdown({
  prepend,
  triggerLabel,
  currentLabel,
  addLabel,
  options,
  onSelect,
  onAdd,
  append,
}: NotesLocationSegmentDropdownProps) {
  return (
    <>
      {prepend}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          {triggerLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{currentLabel}</DropdownMenuLabel>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.id ?? `unfiled:${option.name}`}
                onClick={() => {
                  onSelect(option.id);
                }}
              >
                {option.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onAdd();
              }}
            >
              Add {addLabel}...
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p>{append}</p>
    </>
  );
}
