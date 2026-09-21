import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentationPage } from "@/pages/documentation";
import { PricingPage } from "@/pages/pricing";
import { PrivacyPage } from "@/pages/privacy";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe.each([
  ["pricing", PricingPage, "/pricing"],
  ["privacy", PrivacyPage, "/privacy"],
  ["documentation", DocumentationPage, "/documentation"],
] as const)("%s page chrome", (_name, Page, href) => {
  it("links to the other public pages from the header", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation");

    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "/documentation",
    );
    expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(nav).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("highlights only its own link", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation");
    const highlighted = within(nav)
      .getAllByRole("link")
      .filter(
        (link) =>
          link.className.includes("text-primary") && !link.className.includes("hover:text-primary"),
      );

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveAttribute("href", href);
  });

  it("switches between light and dark mode from the header", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("has a single main landmark and page heading", () => {
    render(<Page />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("PricingPage", () => {
  it("lists every tier with its price and call to action", () => {
    render(<PricingPage />);

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start for Free" })).toBeInTheDocument();
    expect(screen.getByText("Flock Supporter")).toBeInTheDocument();
    expect(screen.getByText("$4 / month")).toBeInTheDocument();
    expect(screen.getByText("Flock Teams")).toBeInTheDocument();
    expect(screen.getByText("$12 / month")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Coming Soon" })).toHaveLength(2);
  });

  it("marks only the beta tier as most popular", () => {
    render(<PricingPage />);
    expect(screen.getAllByText("Most Popular")).toHaveLength(1);
  });

  it("states the security and open-source commitments", () => {
    render(<PricingPage />);
    expect(
      screen.getByRole("heading", { name: "How your data is handled today" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Forever open source" })).toBeInTheDocument();
  });

  it("does not claim encryption the app does not have", () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent).not.toMatch(/encryption-first|secure key management/i);
  });
});

describe("PrivacyPage", () => {
  it("shows the four policy sections as lists", () => {
    render(<PrivacyPage />);
    for (const title of [
      "What we collect",
      "Where your data lives",
      "Who can see it",
      "What is not built yet",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("list")).toHaveLength(4);
  });

  it("says plainly that nothing is encrypted and nothing is collected", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.textContent).toMatch(/not encrypted/i);
    expect(container.textContent).not.toMatch(/AES-GCM|key exchange|row-level/i);
  });

  it("explains local-first storage in three plain steps", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "Privacy in plain language" })).toBeInTheDocument();
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(screen.getByText("Step 3")).toBeInTheDocument();
  });

  it("says when the policy was last updated and how to get in touch", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your choices and contact" })).toBeInTheDocument();
  });
});

describe("DocumentationPage", () => {
  it("describes each level of the Wing/Flight/Branch/Nest hierarchy", () => {
    render(<DocumentationPage />);
    for (const name of ["Wing", "Flight", "Branch", "Nest", "Twig & Feather"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("lays out the roadmap in three areas", () => {
    render(<DocumentationPage />);
    for (const area of ["Core Application", "Real-time Sync", "Encryption and Sharing"]) {
      expect(screen.getByText(area)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("list")).toHaveLength(3);
  });
});
