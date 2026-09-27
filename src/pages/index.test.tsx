import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cachedTheme, chooseTheme, findLoadedButton } from "@/test/theme";

import { IndexPage } from "./index";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("IndexPage", () => {
  it("introduces the product and links to the privacy policy", () => {
    render(<IndexPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Cuervo Planner" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("offers a Get Started call to action", () => {
    render(<IndexPage />);
    expect(screen.getByRole("button", { name: "Get Started Now" })).toBeInTheDocument();
  });

  it("lists all eight benefits, none of them promised for later", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    for (const title of [
      "Private by default",
      "Open Source",
      "Free Beta",
      "Install it like an app",
      "Offline first",
      "Lock it on this device",
      "Sync across devices",
      "Share a course",
    ]) {
      expect(within(benefits).getByText(title)).toBeInTheDocument();
    }
    // Sync and sharing shipped, so nothing on the page is promised for later.
    expect(benefits.textContent).not.toMatch(/coming soon/i);
  });

  it("links to the source repository in the footer", () => {
    render(<IndexPage />);
    const footer = screen.getByRole("contentinfo");

    expect(within(footer).getByRole("link", { name: "Source on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Adan-Garcia/nweb",
    );
  });

  it("says the lock covers titles and leaves due dates readable", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    expect(benefits.textContent).toMatch(/and their titles are encrypted/);
    expect(benefits.textContent).toMatch(/Due dates stay readable/);
  });

  it("does not oversell the lock", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    // The old wording promised more than a browser can give.
    expect(benefits.textContent).not.toMatch(/Device level encryption/i);
  });

  it("has the same links in the desktop nav and the mobile menu", async () => {
    const user = userEvent.setup();
    render(<IndexPage />);
    const nav = screen.getByRole("navigation", { name: "Site" });
    const expected = [
      ["Documentation", "/documentation"],
      ["Pricing", "/pricing"],
      ["Privacy", "/privacy"],
    ];

    for (const [label, href] of expected) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }

    await user.click(await findLoadedButton("Open menu"));

    for (const [label, href] of expected) {
      expect(await screen.findByRole("menuitem", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("offers a way straight into the app", () => {
    render(<IndexPage />);
    expect(screen.getByRole("button", { name: "Open app" })).toHaveAttribute("href", "/dashboard");
  });

  it("toggles the theme from the header", async () => {
    const user = userEvent.setup();
    render(<IndexPage />);

    await chooseTheme(user, "Dark");

    expect(cachedTheme()).toBe("dark");
  });
});
