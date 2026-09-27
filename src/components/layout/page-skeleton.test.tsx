import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "./page-skeleton";

describe("PageSkeleton", () => {
  it("tells assistive technology it is loading", () => {
    render(<PageSkeleton />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
