import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { cachedTheme, chooseTheme } from "@/test/theme";

import { OnboardingPage } from "./onboarding";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

const [first, second, , last] = ONBOARDING_STEPS;

describe("OnboardingPage", () => {
  it("starts on the first step with Back disabled", () => {
    render(<OnboardingPage />);

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText(first.content)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("moves forward and back through the steps", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText(second.content)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("jumps straight to a step chosen from the list", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: new RegExp(last.title) }));

    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByText(last.content)).toBeInTheDocument();
  });

  it("replaces Next with a dashboard button on the last step", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: new RegExp(last.title) }));

    expect(screen.getByRole("button", { name: /Go to Dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Next/ })).not.toBeInTheDocument();
  });

  it("shows a check for finished steps and the step number for the rest", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: /Next/ }));

    const [done, current] = screen.getAllByRole("button", {
      name: /Welcome to Cuervo Planner|Create Your First Wing/,
    });
    expect(done.querySelector("svg")).not.toBeNull();
    expect(current).toHaveTextContent("2");
  });

  it("toggles the theme", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await chooseTheme(user, "Dark");

    expect(cachedTheme()).toBe("dark");
  });
});
