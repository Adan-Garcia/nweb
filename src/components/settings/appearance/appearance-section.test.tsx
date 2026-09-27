import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePreferencesStore } from "@/stores/use-preferences-store";

import { AppearanceSection } from "./appearance-section";

const preferences = () => usePreferencesStore.getState().preferences;

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("AppearanceSection", () => {
  it("shows the current choices as pressed", () => {
    usePreferencesStore.getState().update({ theme: "paper", density: "compact" });
    render(<AppearanceSection />);

    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Paper" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(theme).getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(screen.getByRole("group", { name: "Density" })).getByRole("button", {
        name: "Compact",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("changes theme, accent, density, text size and sidebar", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);

    await user.click(screen.getByRole("button", { name: "Black" }));
    await user.click(screen.getByRole("button", { name: "Indigo" }));
    await user.click(screen.getByRole("button", { name: "Spacious" }));
    await user.click(screen.getByRole("button", { name: "Large" }));
    await user.click(screen.getByRole("button", { name: "Icons only" }));

    expect(preferences()).toMatchObject({
      theme: "oled",
      accent: "indigo",
      density: "spacious",
      fontSize: "lg",
      sidebar: "icons",
    });
  });

  it("does not unchoose a choice when it is pressed again", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);

    await user.click(screen.getByRole("button", { name: "System" }));
    await user.click(screen.getByRole("button", { name: "Rose" }));

    expect(preferences()).toMatchObject({ theme: "system", accent: "rose" });
  });

  it("reorders the navigation", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    const list = screen.getByRole("list", { name: "Navigation order" });

    expect(within(list).getByRole("button", { name: "Move Dashboard up" })).toBeDisabled();
    expect(within(list).getByRole("button", { name: "Move Notes down" })).toBeDisabled();

    await user.click(within(list).getByRole("button", { name: "Move Notes up" }));
    await user.click(within(list).getByRole("button", { name: "Move Dashboard down" }));

    expect(preferences().navOrder).toEqual(["calendar", "dashboard", "notes", "board"]);
  });

  it("hides, shows and reorders dashboard cards", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    const list = screen.getByRole("list", { name: "Dashboard cards" });
    const toggle = within(list).getByRole("button", { name: "Show Stats" });

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(preferences().dashboardCards.find((card) => card.id === "stats")?.visible).toBe(false);
    expect(within(list).getByRole("button", { name: "Show Stats" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(within(list).getByRole("button", { name: "Show Stats" }));
    await user.click(within(list).getByRole("button", { name: "Move Recent notes up" }));

    expect(preferences().dashboardCards.map((card) => card.id)).toEqual([
      "next-priority",
      "stats",
      "recent-notes",
      "upcoming",
    ]);
    expect(preferences().dashboardCards.every((card) => card.visible)).toBe(true);
  });
});
