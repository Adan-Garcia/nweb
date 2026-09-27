import { useWatch } from "react-hook-form";

import { SegmentedControl } from "@/components/layout/segmented-control";
import type { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Editor = ReturnType<typeof useFeedEditor>;

type FeedSourceFieldsProps = {
  form: Editor["form"];
  source: Editor["source"];
  onLoadUrl: (url: string) => void;
  onLoadFile: (file: File) => void;
};

const SOURCE_OPTIONS = [
  { value: "url", label: "Subscribe to a link" },
  { value: "file", label: "Import a file" },
] as const;

/** The calendar's name, and where it is read from: a link to keep up with, or a file. */
export function FeedSourceFields({ form, source, onLoadUrl, onLoadFile }: FeedSourceFieldsProps) {
  const kind = useWatch({ control: form.control, name: "source" });
  const { errors } = form.formState;

  return (
    <div className="grid gap-4">
      <SegmentedControl
        label="Where the calendar comes from"
        value={kind}
        options={SOURCE_OPTIONS}
        onChange={(value) => form.setValue("source", value)}
      />

      {kind === "url" ? (
        <Field data-invalid={!!errors.url}>
          <FieldLabel htmlFor="feed-url">Calendar link</FieldLabel>
          <div className="flex gap-2">
            <Input
              {...form.register("url")}
              id="feed-url"
              type="url"
              autoComplete="off"
              placeholder="webcal://… or https://….ics"
              aria-invalid={!!errors.url}
            />
            <Button
              type="button"
              variant="outline"
              disabled={source.state === "loading"}
              onClick={() => onLoadUrl(form.getValues("url"))}
            >
              Preview
            </Button>
          </div>
          <FieldDescription>
            In myCourses it is under Calendar → Subscribe; in Canvas, Calendar → Calendar Feed.
          </FieldDescription>
          <FieldError errors={[errors.url]} />
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="feed-file">Calendar file</FieldLabel>
          <Input
            id="feed-file"
            type="file"
            accept=".ics,text/calendar"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];

              if (file) {
                onLoadFile(file);
              }
            }}
          />
          <FieldDescription>Import the file again later to bring in what changed.</FieldDescription>
        </Field>
      )}

      <p role="status" className="m-0 text-sm text-muted-foreground">
        {source.state === "loading" ? "Reading the calendar…" : null}
        {source.state === "ready"
          ? "Calendar read. The preview below shows what will come in."
          : null}
      </p>
      {source.state === "error" ? (
        <p role="alert" className="m-0 text-sm text-destructive">
          {source.message}
        </p>
      ) : null}

      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="feed-name">Name</FieldLabel>
        <Input
          {...form.register("name")}
          id="feed-name"
          placeholder="e.g. myCourses"
          aria-invalid={!!errors.name}
        />
        <FieldError errors={[errors.name]} />
      </Field>
    </div>
  );
}
