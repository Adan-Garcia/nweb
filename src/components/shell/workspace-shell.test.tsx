import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePreferencesStore } from "@/stores/use-preferences-store";
import { chooseTheme } from "@/test/theme";

import { WorkspaceShell } from "./workspace-shell";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

function setup(path = "/dashboard") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceShell>
        <p>Page content</p>
      </WorkspaceShell>
    </MemoryRouter>,
  );
}

const sidebarNav = () =>
  screen
    .getByText("Workspace", { selector: "[data-sidebar='group-label']" })
    .closest("[data-sidebar='group']") as HTMLElement;

describe("WorkspaceShell", () => {
  it("renders the page inside the shell", () => {
    setup();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("links to every workspace page, in the sidebar and in the phone tab bar", () => {
    setup();
    const tabs = screen.getByRole("navigation", { name: "Workspace" });

    for (const [name, href] of [
      ["Dashboard", "/dashboard"],
      ["Calendar", "/calendar"],
      ["Board", "/board"],
      ["Notes", "/notes"],
    ]) {
      expect(within(sidebarNav()).getByRole("link", { name })).toHaveAttribute("href", href);
      expect(within(tabs).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getAllByRole("link", { name: "Settings" })[0]).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("orders the nav the way the preferences say", () => {
    usePreferencesStore
      .getState()
      .update({ navOrder: ["notes", "board", "calendar", "dashboard"] });
    setup();

    expect(
      within(sidebarNav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Notes", "Board", "Calendar", "Dashboard"]);
  });

  it.each([
    ["/dashboard", "Dashboard"],
    ["/calendar", "Calendar"],
    ["/notes", "Notes"],
    ["/settings", "Settings"],
  ])("marks only the current route's sidebar link as active at %s", (path, label) => {
    setup(path);
    const active = screen.getAllByRole("link").filter((link) => link.hasAttribute("data-active"));

    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent(label);
  });

  it("marks the current page in the tab bar", () => {
    setup("/board");
    const tabs = screen.getByRole("navigation", { name: "Workspace" });

    expect(within(tabs).getByRole("link", { name: "Board" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "Notes" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing active on an unknown route", () => {
    setup("/somewhere-else");
    expect(
      screen.getAllByRole("link").filter((link) => link.hasAttribute("data-active")),
    ).toHaveLength(0);
  });

  it("collapses the sidebar to icons and remembers it", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getAllByRole("button", { name: "Toggle Sidebar" })[0]);

    expect(usePreferencesStore.getState().preferences.sidebar).toBe("icons");
    expect(document.querySelector("[data-state='collapsed']")).not.toBeNull();
  });

  it("switches the theme from the sidebar's theme menu", async () => {
    const user = userEvent.setup();
    setup();

    await chooseTheme(user, "Dark");

    expect(usePreferencesStore.getState().preferences.theme).toBe("dark");
  });

  it("opens the command palette from Search", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /Search/ }));

    expect(await screen.findByPlaceholderText("Search or type a command…")).toBeInTheDocument();
  });
});
