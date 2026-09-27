import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "./empty-state";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";
import { PageSkeleton } from "./page-skeleton";
import { SegmentedControl } from "./segmented-control";

describe("PageHeader", () => {
  it("puts the title, description, eyebrow, actions and extras in their places", () => {
    render(
      <PageHeader
        title="Board"
        description="Every task."
        eyebrow="Monday"
        actions={<button type="button">Add Task</button>}
      >
        <p>Filters</p>
      </PageHeader>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
    expect(screen.getByText("Every task.")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Task" })).toBeInTheDocument();
    expect(screen.getByText("Filters")).toBeInTheDocument();
  });

  it("renders only a title when that is all it is given", () => {
    const { container } = render(<PageHeader title="Notes" />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("PageContainer", () => {
  it("uses the width asked for", () => {
    const { container } = render(<PageContainer width="narrow">x</PageContainer>);

    expect(container.firstChild).toHaveClass("max-w-4xl");
  });
});

describe("PageSkeleton", () => {
  it("tells assistive technology it is loading", () => {
    render(<PageSkeleton />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("says what is missing and offers the way to add it", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No notes yet"
        description="Create one to begin."
        action={<button type="button">New note</button>}
      />,
    );

    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(screen.getByText("Create one to begin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("marks the chosen option and reports a new one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="View"
        value="a"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("group", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledWith("b");
  });
});
