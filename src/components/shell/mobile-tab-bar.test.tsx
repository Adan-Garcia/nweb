import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

import { MobileTabBar } from "./mobile-tab-bar";

function SheetState() {
  const { openMobile } = useSidebar();

  return <p>{openMobile ? "sheet open" : "sheet closed"}</p>;
}

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
});

describe("MobileTabBar", () => {
  it("opens the sidebar sheet from More", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <MobileTabBar />
          <SheetState />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("sheet closed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByText("sheet open")).toBeInTheDocument();
  });
});
