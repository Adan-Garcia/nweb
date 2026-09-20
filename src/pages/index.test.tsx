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
      "Fast syncing",
      "Open Source",
      "Free Beta",
      "Device Level Encryption",
      "Easy sharing",
      "Cross platform",
      "Offline first",
    ]) {
      expect(within(benefits).getByText(title)).toBeInTheDocument();
    }
  });

  it("has the same links in the desktop nav and the mobile menu, including the calendar", () => {
    render(<IndexPage />);
    const nav = screen.getByRole("navigation");
    const expected = [
      ["About", "#"],
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
