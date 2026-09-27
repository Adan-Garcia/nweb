import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LinearNotesEditor } from "./linear-notes-editor";

// ProseMirror measures text with layout APIs that jsdom leaves out; stub the minimum it needs.
document.elementFromPoint = () => null;
Range.prototype.getClientRects = () => document.body.getClientRects();
Range.prototype.getBoundingClientRect = () => new DOMRect();

describe("LinearNotesEditor", () => {
  it("shows the note's content in an editable area", async () => {
    render(<LinearNotesEditor value="<p>hello world</p>" onChange={vi.fn()} />);

    const text = await screen.findByText("hello world");

    expect(text.closest("[contenteditable]")).toHaveAttribute("contenteditable", "true");
  });

  it("reports the edited HTML as the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LinearNotesEditor value="<p>hello</p>" onChange={onChange} />);

    const editor = (await screen.findByText("hello")).closest("[contenteditable]");
    if (!(editor instanceof HTMLElement)) throw new Error("editable area not found");
    // Focus and place the caret at the end directly: jsdom does not implement pointer selection.
    editor.focus();
    const selection = window.getSelection();
    selection?.selectAllChildren(editor);
    selection?.collapseToEnd();
    await user.keyboard(" there");

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith("<p>hello there</p>");
  });

  it("replaces the content when a different note's value arrives", async () => {
    const { rerender } = render(<LinearNotesEditor value="<p>first note</p>" onChange={vi.fn()} />);
    expect(await screen.findByText("first note")).toBeInTheDocument();

    rerender(<LinearNotesEditor value="<p>second note</p>" onChange={vi.fn()} />);

    expect(await screen.findByText("second note")).toBeInTheDocument();
    expect(screen.queryByText("first note")).not.toBeInTheDocument();
  });

  it("renders headings and lists from stored HTML", async () => {
    render(
      <LinearNotesEditor
        value="<h2>Plan</h2><ul><li>one</li><li>two</li></ul>"
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "Plan" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("cannot be typed into when the note was shared to read, and can again when it is not", async () => {
    const { rerender } = render(
      <LinearNotesEditor value="<p>theirs</p>" onChange={vi.fn()} isReadOnly />,
    );

    const text = await screen.findByText("theirs");

    await waitFor(() =>
      expect(text.closest("[contenteditable]")).toHaveAttribute("contenteditable", "false"),
    );

    rerender(<LinearNotesEditor value="<p>theirs</p>" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(text.closest("[contenteditable]")).toHaveAttribute("contenteditable", "true"),
    );
  });
});
