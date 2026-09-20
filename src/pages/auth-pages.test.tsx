import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInPage } from "./signin";
import { SignupPage } from "./signup";
import { UnloggedPage } from "./unlogged";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe.each([
  ["sign in", SignInPage],
  ["sign up", SignupPage],
  ["unlogged", UnloggedPage],
] as const)("%s page", (_name, Page) => {
  it("has a page heading and brand links back to the auth start", () => {
    render(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const brandLinks = screen.getAllByRole("link", { name: /Cuervo Planner/ });
    expect(brandLinks.length).toBeGreaterThan(0);
    for (const link of brandLinks) {
      expect(link).toHaveAttribute("href", "/auth");
    }
  });

  it("switches between light and dark mode", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});

describe("the forms on the auth pages", () => {
  it("sign in shows the login form", () => {
    render(<SignInPage />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("sign up shows the signup form", () => {
    render(<SignupPage />);
    expect(screen.getByText("Create an account")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
  });

  it("sign up talks about signing up, not signing in", () => {
    render(<SignupPage />);
    expect(screen.getByRole("region", { name: "Sign up form" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sign in form" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(/sign in|pick up/i);
  });

  it("sign in still says it is the sign in form", () => {
    render(<SignInPage />);
    expect(screen.getByRole("region", { name: "Sign in form" })).toBeInTheDocument();
  });

  it("the unlogged page links to the privacy policy and offers signup", () => {
    render(<UnloggedPage />);
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("button", { name: "Signup Now" })).toBeInTheDocument();
  });
});
