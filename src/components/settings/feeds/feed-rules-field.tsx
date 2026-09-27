import { Plus } from "lucide-react";
import { useFieldArray } from "react-hook-form";

import { type BranchOption, newRule } from "@/components/settings/feeds/feed-form";
import { SELECT_CLASS } from "@/components/settings/feeds/feed-options-fields";
import { FeedRuleRow } from "@/components/settings/feeds/feed-rule-row";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { Button } from "@/components/ui/button";
import { FEED_PRESETS, presetRules } from "@/lib/feeds/feed-presets";

type FeedRulesFieldProps = {
  form: ReturnType<typeof useFeedEditor>["form"];
  branchOptions: BranchOption[];
};

/** The feed's rules, in the order they run, with presets to start from. */
export function FeedRulesField({ form, branchOptions }: FeedRulesFieldProps) {
  const rules = useFieldArray({ control: form.control, name: "rules", keyName: "key" });

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Rules</legend>

      {rules.fields.length ? (
        <ol className="m-0 grid list-none gap-3 p-0">
          {rules.fields.map((rule, index) => (
            <FeedRuleRow
              key={rule.key}
              form={form}
              index={index}
              count={rules.fields.length}
              branchOptions={branchOptions}
              onMove={(to) => rules.move(index, to)}
              onRemove={() => rules.remove(index)}
            />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          No rules: every event comes in as it is. Add one to hide, rename or sort events.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => rules.append(newRule())}>
          <Plus className="size-4" aria-hidden="true" />
          Add a rule
        </Button>
        <select
          aria-label="Add rules for a platform"
          className={SELECT_CLASS}
          value=""
          onChange={(event) => {
            const preset = FEED_PRESETS.find((option) => option.id === event.currentTarget.value);

            if (preset) {
              rules.append(presetRules(preset));
            }
          }}
        >
          <option value="">Add rules for…</option>
          {FEED_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
