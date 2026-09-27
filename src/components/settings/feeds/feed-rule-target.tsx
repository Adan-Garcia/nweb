import type { BranchOption } from "@/components/settings/feeds/feed-form";
import { SELECT_CLASS } from "@/components/settings/feeds/feed-options-fields";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { Input } from "@/components/ui/input";
import type { FeedRuleAction } from "@/lib/feeds/feed-model";
import { TWIG_KIND_LABELS, TWIG_KINDS } from "@/lib/twigs/twig-model";

type FeedRuleTargetProps = {
  form: ReturnType<typeof useFeedEditor>["form"];
  index: number;
  action: FeedRuleAction;
  branchOptions: BranchOption[];
  isInvalid: boolean;
};

/** What a rule does once it matches: the replacement, the kind, or the course it names. */
export function FeedRuleTarget({
  form,
  index,
  action,
  branchOptions,
  isInvalid,
}: FeedRuleTargetProps) {
  const name = `rules.${index}` as const;
  const label = `Rule ${index + 1}`;

  return (
    <>
      {action === "rename" || action === "branch-from" ? (
        <Input
          aria-label={action === "rename" ? `${label} replace with` : `${label} course name`}
          className="font-mono"
          placeholder={
            action === "rename"
              ? "Replace with (empty removes it; $1 is a group)"
              : "$1 $2 (empty uses the whole match)"
          }
          {...form.register(`${name}.replacement`)}
        />
      ) : null}

      {action === "set-kind" ? (
        <select
          aria-label={`${label} kind`}
          className={SELECT_CLASS}
          {...form.register(`${name}.kind`)}
        >
          {TWIG_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {TWIG_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      ) : null}

      {action === "set-branch" ? (
        <select
          aria-label={`${label} course`}
          aria-invalid={isInvalid}
          className={SELECT_CLASS}
          {...form.register(`${name}.branchId`)}
        >
          <option value="">Choose a course…</option>
          {branchOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.label}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}
