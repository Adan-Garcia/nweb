import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cachedTheme, chooseTheme } from "@/test/theme";

import { SignInPage } from "./signin";
import { SignupPage } from "./signup";
import { UnloggedPage } from "./unlogged";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

/** The auth pages link and navigate, so they render inside a router. */
function renderPage(Page: ComponentType) {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

describe.each([
  ["sign in", SignInPage],
  ["sign up", SignupPage],
  ["unlogged", UnloggedPage],
] as const)("%s page", (_name, Page) => {
  it("has a page heading and brand links back to the auth start", () => {
    renderPage(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const brandLinks = screen.getAllByRole("link", { name: /Cuervo Planner/ });
    expect(brandLinks.length).toBeGreaterThan(0);
    for (const link of brandLinks) {
      expect(link).toHaveAttribute("href", "/auth");
    }
  });

  it("switches between light and dark mode", async () => {
    const user = userEvent.setup();
    renderPage(Page);

    await chooseTheme(user, "Dark");

    expect(cachedTheme()).toBe("dark");
  });
});

describe("the forms on the auth pages", () => {
  it("sign up talks about signing up, not signing in", () => {
    renderPage(SignupPage);
    expect(screen.getByRole("region", { name: "Sign up form" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sign in form" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(/sign in|pick up/i);
  });

  it("sign in still says it is the sign in form", () => {
    renderPage(SignInPage);
    expect(screen.getByRole("region", { name: "Sign in form" })).toBeInTheDocument();
  });

  it("the unlogged page links to the privacy policy and offers signup", () => {
    renderPage(UnloggedPage);
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("button", { name: "Signup Now" })).toBeInTheDocument();
  });
});
