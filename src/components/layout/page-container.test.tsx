import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageContainer } from "./page-container";

describe("PageContainer", () => {
  it("uses the width asked for", () => {
    const { container } = render(<PageContainer width="narrow">x</PageContainer>);

    expect(container.firstChild).toHaveClass("max-w-4xl");
  });
});
