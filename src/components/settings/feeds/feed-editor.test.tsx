import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { server } from "@/test/server";

import { FeedEditor } from "./feed-editor";
import { useFeedEditor } from "./use-feed-editor";

const FEED = "https://mycourses.example.edu/feed.ics";

const event = (uid: string, summary: string, start: string, location: string) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  `SUMMARY:${summary}`,
  `LOCATION:${location}`,
  `DTSTART:${start}`,
  "END:VEVENT",
];

const ICS = [
  "BEGIN:VCALENDAR",
  "X-WR-CALNAME:All Courses",
  ...event("a", "QUIZ #1 - Available", "20990105T130000Z", "MECE.203.01 - Strength of Materials"),
  ...event("b", "QUIZ #1 - Due", "20990106T040000Z", "MECE.203.01 - Strength of Materials"),
  ...event("c", "TA Office Hours", "20990107T150000Z", "MECE.102.01 - Mechanics"),
  "END:VCALENDAR",
].join("\r\n");

const BRANCHES = [{ id: "physics", label: "Fall 2098 / Physics" }];

function Harness({ onSaved }: { onSaved: () => Promise<void> }) {
  const editor = useFeedEditor({ onSaved });

  return (
    <>
      <button type="button" onClick={() => editor.open(null)}>
        Open
      </button>
      <FeedEditor editor={editor} branchOptions={BRANCHES} />
    </>
  );
}

async function openEditor() {
  const user = userEvent.setup();
  const onSaved = vi.fn(() => Promise.resolve());

  render(<Harness onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: "Open" }));

  return { user, onSaved, dialog: screen.getByRole("dialog") };
}

async function importFile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Import a file" }));
  await user.upload(
    screen.getByLabelText("Calendar file"),
    new File([ICS], "courses.ics", { type: "text/calendar" }),
  );
  await screen.findByText(/Calendar read/);
}

beforeEach(async () => {
  await (await getNotesDb()).clear("feeds");
});

describe("FeedEditor", () => {
  it("previews a file, names the feed after it, and imports it on save", async () => {
    const { user, onSaved } = await openEditor();

    expect(screen.getByText(/Preview the link or choose a file/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Check for changes")).toBeInTheDocument();

    await importFile(user);

    expect(screen.getByLabelText("Name")).toHaveValue("All Courses");
    expect(screen.queryByLabelText("Check for changes")).not.toBeInTheDocument();
    expect(screen.getByText("3 events kept, 0 hidden by rules.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add calendar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.anything(), ICS));
  });

  it("applies a preset, and the preview follows the rules as they change", async () => {
    const { user } = await openEditor();

    await importFile(user);
    await user.selectOptions(screen.getByLabelText("Add rules for a platform"), "brightspace");

    const preview = within(screen.getByRole("region", { name: "Preview" }));

    expect(preview.getByText("1 events kept, 2 hidden by rules.")).toBeInTheDocument();
    expect(preview.getByText("QUIZ #1")).toBeInTheDocument();
    expect(preview.getByText(/Exam · MECE 203 Strength of Materials/)).toBeInTheDocument();

    // Switching a rule off lets through what it hid.
    await user.click(screen.getByLabelText("Rule 2 is on"));
    expect(preview.getByText("2 events kept, 1 hidden by rules.")).toBeInTheDocument();
  });

  it("shows each action's own input, and names the course a rule picks", async () => {
    const { user } = await openEditor();

    await importFile(user);
    await user.click(screen.getByRole("button", { name: "Add a rule" }));

    const action = screen.getByLabelText("Rule 1 action");

    await user.selectOptions(action, "rename");
    expect(screen.getByLabelText("Rule 1 replace with")).toBeInTheDocument();

    await user.selectOptions(action, "branch-from");
    expect(screen.getByLabelText("Rule 1 course name")).toBeInTheDocument();

    await user.selectOptions(action, "set-kind");
    await user.selectOptions(screen.getByLabelText("Rule 1 kind"), "reading");

    await user.selectOptions(action, "set-branch");
    await user.selectOptions(screen.getByLabelText("Rule 1 course"), "physics");
    await user.type(screen.getByLabelText("Rule 1 pattern"), "Office");

    expect(screen.getByText(/Fall 2098 \/ Physics/, { selector: "span" })).toBeInTheDocument();
  });

  it("refuses a pattern that does not compile, and says why", async () => {
    const { user, onSaved } = await openEditor();

    await importFile(user);
    await user.click(screen.getByRole("button", { name: "Add a rule" }));
    await user.type(screen.getByLabelText("Rule 1 pattern"), "(unclosed");
    await user.click(screen.getByRole("button", { name: "Add calendar" }));

    expect(await screen.findByText(/Unterminated group/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reorders and removes rules", async () => {
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Add a rule" }));
    await user.click(screen.getByRole("button", { name: "Add a rule" }));
    await user.type(screen.getByLabelText("Rule 1 pattern"), "first");

    expect(screen.getByRole("button", { name: "Move Rule 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Rule 2 down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move Rule 1 down" }));
    expect(screen.getByLabelText("Rule 2 pattern")).toHaveValue("first");

    await user.click(screen.getByRole("button", { name: "Move Rule 2 up" }));
    expect(screen.getByLabelText("Rule 1 pattern")).toHaveValue("first");

    await user.click(screen.getByRole("button", { name: "Remove Rule 1" }));
    expect(screen.getByLabelText("Rule 1 pattern")).toHaveValue("");
    expect(screen.queryByLabelText("Rule 2 pattern")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Rule 1" }));
    expect(screen.getByText(/No rules: every event comes in as it is/)).toBeInTheDocument();
  });

  it("previews a link, and asks for one before saving a subscription", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const { user, onSaved } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Add calendar" }));
    expect(await screen.findByText(/Paste the calendar's address/)).toBeInTheDocument();
    expect(screen.getByText("Give this calendar a name.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Calendar link"), FEED);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("3 events kept, 0 hidden by rules.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add calendar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("reports a file that is not a calendar", async () => {
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Import a file" }));
    await user.upload(screen.getByLabelText("Calendar file"), new File(["hello"], "notes.ics"));

    expect(await screen.findByRole("alert")).toHaveTextContent("That file is not a calendar.");
  });

  it("closes on Cancel", async () => {
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
