import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

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
