import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

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
