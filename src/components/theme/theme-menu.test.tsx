import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePreferencesStore } from "@/stores/use-preferences-store";
import { findLoadedButton } from "@/test/theme";

import { ThemeMenu } from "./theme-menu";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("ThemeMenu", () => {
  it("offers every theme and marks the chosen one", async () => {
    const user = userEvent.setup();
    usePreferencesStore.getState().update({ theme: "paper" });
    render(<ThemeMenu />);

    await user.click(await findLoadedButton("Theme"));

    for (const name of ["System", "Light", "Dark", "Paper", "Black"]) {
      expect(await screen.findByRole("menuitemradio", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("menuitemradio", { name: "Paper" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("menuitem", { name: /Customize/ })).toBeNull();
  });

  it("links to the full appearance settings when it knows where they are", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ThemeMenu settingsHref="/settings#appearance" />} />
          <Route path="/settings" element={<p>Settings page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await findLoadedButton("Theme"));
    await user.click(await screen.findByRole("menuitem", { name: /Customize/ }));

    expect(await screen.findByText("Settings page")).toBeInTheDocument();
  });
});
