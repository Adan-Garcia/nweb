import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";

type ItemProps = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
};

/** A row of the canvas's "More" panel that does something. */
export function MenuItem({ label, Icon, onClick, disabled, pressed }: ItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

/** A row of the canvas's "More" panel that turns a setting on or off. */
export function MenuToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-1.5 text-body hover:bg-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 accent-primary"
      />
      <span className="flex flex-col">
        <span>{label}</span>
        <span className="text-caption text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
