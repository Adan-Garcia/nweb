import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { looksLikeIcs } from "@shared/feed-contract";
import { useForm } from "react-hook-form";

import {
  feedFormSchema,
  type FeedFormValues,
  toFeedSettings,
  toFormValues,
} from "@/components/settings/feeds/feed-form";
import { fetchFeedText } from "@/lib/feeds/feed-fetch";
import { type Feed, FEED_ERROR_MESSAGES, normalizeFeedUrl } from "@/lib/feeds/feed-model";
import { saveFeed } from "@/lib/feeds/feed-storage";
import { parseIcs } from "@/lib/feeds/ics-parse";

/**
 * Where the calendar being edited came from, once it has been read: the text the preview
 * runs the rules over, and what saving imports without fetching it a second time.
 */
export type FeedSource =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; text: string; origin: string }
  | { state: "error"; message: string };

type FeedEditorOptions = {
  /**
   * Called with the saved feed, and the text to import now when there is some. A feed with
   * neither an address nor new text has only had its settings changed.
   */
  onSaved: (feed: Feed, text?: string) => Promise<void>;
};

/** The add/edit dialog for one feed: its form, the calendar it previews, and saving it. */
export function useFeedEditor({ onSaved }: FeedEditorOptions) {
  const [editing, setEditing] = useState<{ feed: Feed | null } | null>(null);
  const [source, setSource] = useState<FeedSource>({ state: "idle" });
  const form = useForm<FeedFormValues>({
    resolver: zodResolver(feedFormSchema),
    defaultValues: toFormValues(null),
  });

  const open = (feed: Feed | null) => {
    form.reset(toFormValues(feed));
    setSource({ state: "idle" });
    setEditing({ feed });
  };

  const close = () => setEditing(null);

  /** A calendar's own name, offered when the name field is still empty. */
  const adopt = (text: string, origin: string, fallbackName: string) => {
    setSource({ state: "ready", text, origin });

    if (!form.getValues("name").trim()) {
      form.setValue("name", parseIcs(text).name ?? fallbackName, { shouldValidate: true });
    }
  };

  const loadUrl = async (address: string) => {
    const url = normalizeFeedUrl(address);

    if (!url) {
      setSource({ state: "error", message: FEED_ERROR_MESSAGES["invalid-url"] });
      return;
    }

    setSource({ state: "loading" });

    const fetched = await fetchFeedText(url);

    if (fetched.ok) {
      adopt(fetched.text, url, new URL(url).hostname);
    } else {
      setSource({ state: "error", message: FEED_ERROR_MESSAGES[fetched.error] });
    }
  };

  const loadFile = async (file: File) => {
    const text = await file.text();

    if (looksLikeIcs(text)) {
      adopt(text, `file:${file.name}`, file.name.replace(/\.ics$/i, ""));
    } else {
      setSource({ state: "error", message: "That file is not a calendar. Choose an .ics file." });
    }
  };

  const submit = async (values: FeedFormValues) => {
    const settings = toFeedSettings(values);
    const loaded = source.state === "ready" ? source : null;
    // What was previewed is imported as it is, rather than fetched again a moment later.
    const text =
      values.source === "file"
        ? loaded?.origin.startsWith("file:")
          ? loaded.text
          : undefined
        : loaded?.origin === settings.url
          ? loaded.text
          : undefined;

    // A new calendar from a file has nothing to import until a file is chosen. An existing
    // one may be saved without one: its rules change, and the next file applies them.
    if (values.source === "file" && text === undefined && !editing?.feed) {
      setSource({ state: "error", message: "Choose the calendar file to import." });
      return;
    }

    const feed = await saveFeed(settings, editing?.feed?.id);

    close();
    await onSaved(feed, text);
  };

  return {
    isOpen: editing !== null,
    feed: editing?.feed ?? null,
    form,
    source,
    open,
    close,
    loadUrl,
    loadFile,
    submit,
  };
}
