import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useWatch } from "react-hook-form";

import type { BranchOption } from "@/components/settings/feeds/feed-form";
import { SELECT_CLASS } from "@/components/settings/feeds/feed-options-fields";
import { FeedRuleTarget } from "@/components/settings/feeds/feed-rule-target";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FEED_RULE_ACTION_LABELS,
  FEED_RULE_ACTIONS,
  FEED_RULE_FIELD_LABELS,
  FEED_RULE_FIELDS,
} from "@/lib/feeds/feed-model";

type FeedRuleRowProps = {
  form: ReturnType<typeof useFeedEditor>["form"];
  index: number;
  count: number;
  branchOptions: BranchOption[];
  onMove: (to: number) => void;
  onRemove: () => void;
};

/** One rule: "<action> <field> matches <pattern>", and whatever that action needs. */
export function FeedRuleRow({
  form,
  index,
  count,
  branchOptions,
  onMove,
  onRemove,
}: FeedRuleRowProps) {
  const name = `rules.${index}` as const;
  const action = useWatch({ control: form.control, name: `${name}.action` });
  const errors = form.formState.errors.rules?.[index];
  const label = `Rule ${index + 1}`;

  return (
    <li className="grid gap-2 rounded-lg border border-border/70 p-3" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          aria-label={`${label} is on`}
          {...form.register(`${name}.enabled`)}
        />
        <select
          aria-label={`${label} action`}
          className={SELECT_CLASS}
          {...form.register(`${name}.action`)}
        >
          {FEED_RULE_ACTIONS.map((option) => (
            <option key={option} value={option}>
              {FEED_RULE_ACTION_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} field`}
          className={SELECT_CLASS}
          {...form.register(`${name}.field`)}
        >
          {FEED_RULE_FIELDS.map((option) => (
            <option key={option} value={option}>
              {FEED_RULE_FIELD_LABELS[option]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Move ${label} down`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`${label} pattern`}
          aria-invalid={!!errors?.pattern}
          className="min-w-48 flex-1 font-mono"
          placeholder={
            action === "branch-from" ? "([A-Z]{4})\\.(\\d{3})" : "office hours|recitation"
          }
          {...form.register(`${name}.pattern`)}
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" {...form.register(`${name}.caseSensitive`)} />
          Match case
        </label>
      </div>
      {errors?.pattern ? (
        <p role="alert" className="m-0 text-sm text-destructive">
          {errors.pattern.message}
        </p>
      ) : null}

      <FeedRuleTarget
        form={form}
        index={index}
        action={action}
        branchOptions={branchOptions}
        isInvalid={!!errors?.branchId}
      />
    </li>
  );
}
