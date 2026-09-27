import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

type RekeyProgressBarProps = {
  progress: RekeyProgress | null;
  label: string;
};

/**
 * How far a rekey has got. It exists because the alternative is a spinner on a workspace
 * with a gigabyte of PDFs in it, and a spinner that may have minutes left says nothing.
 *
 * The width is computed rather than a utility class, which is what inline style is for
 * (CLAUDE.md section 8): Tailwind cannot generate a class per percentage.
 */
export function RekeyProgressBar({ progress, label }: RekeyProgressBarProps) {
  if (!progress) {
    return null;
  }

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="grid gap-1.5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={progress.done}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        {label}: {progress.done} of {progress.total} rows.
      </p>
    </div>
  );
}
