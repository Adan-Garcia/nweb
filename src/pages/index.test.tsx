import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("lists all eight benefits", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    for (const title of [
      "Private by default",
      "Open Source",
      "Free Beta",
      "Works in any browser",
      "Offline first",
      "Lock it on this device",
      "Fast syncing",
      "Easy sharing",
    ]) {
      expect(within(benefits).getByText(title)).toBeInTheDocument();
    }
  });

  it("links to the source repository in the footer", () => {
    render(<IndexPage />);
    const footer = screen.getByRole("contentinfo");

    expect(within(footer).getByRole("link", { name: "Source on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Adan-Garcia/nweb",
    );
  });

  it("marks the benefits that do not exist yet as coming soon", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    expect(within(benefits).getAllByText("Coming soon")).toHaveLength(2);
    for (const title of ["Fast syncing", "Easy sharing"]) {
      expect(within(benefits).getByText(title).textContent).toContain("Coming soon");
    }
  });

  it("no longer calls the lock coming soon, and does not oversell it either", () => {
    render(<IndexPage />);
    const benefits = screen.getByLabelText("Features and benefits of using Cuervo Planner");

    const lock = within(benefits).getByText("Lock it on this device");
    expect(lock.textContent).not.toContain("Coming soon");
    // The old wording promised more than a browser can give.
    expect(benefits.textContent).not.toMatch(/Device level encryption/i);
  });

  it("has the same links in the desktop nav and the mobile menu, including the calendar", () => {
    render(<IndexPage />);
    const nav = screen.getByRole("navigation");
    const expected = [
      ["Documentation", "/documentation"],
      ["Pricing", "/pricing"],
      ["Privacy", "/privacy"],
      ["Calendar", "/calendar"],
    ];

    for (const [label, href] of expected) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", href);
      // The mobile menu repeats each link.
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThanOrEqual(2);
    }
    expect(screen.getByText("Open menu")).toBeInTheDocument();
  });

  it("toggles the theme from the header", async () => {
    const user = userEvent.setup();
    render(<IndexPage />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
  });
});
